/**
 * The only outbound network calls in the project.
 *
 * Every constraint here is a requirement from CLAUDE.md, not a preference.
 * Both URLs are module constants: nothing from the database or from a parsed
 * response is ever interpolated into a fetch target, which is what closes the
 * SSRF surface outright.
 *
 * There are two callers and one implementation. CLAUDE.md allows two similar
 * functions rather than a shared helper - but it permits duplication, it does
 * not require it, and this is the allowlist, the size cap and the retry policy.
 * Two copies of security code means a fix to one silently misses the other.
 */

import { createHash } from 'node:crypto';

/** Unlisted subdomains are rejected too. */
const ALLOWED_HOSTS = new Set(['www.canada.ca', 'api.io.canada.ca']);

const ROUNDS_URL = 'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';

/**
 * IRCC's newsroom, as JSON rather than the Atom feed ARCHITECTURE.md section 3
 * mentions - verified 2026-08-31 to return application/json with entries shaped
 * { link, teaser, publishedDate, title }. JSON means no XML parser dependency.
 *
 * A different Government of Canada host, hence the second allowlist entry.
 * `pick` bounds the response: the feed is newest-first and the ingester only
 * ever needs what has appeared since it last ran.
 */
const NEWS_URL =
  'https://api.io.canada.ca/io-server/gc/news/en/v2'
  + '?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=50&format=json';

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_000;

export type FetchedPayload = {
  url: string;
  body: string;
  contentHash: string;
  fetchedAt: string;
};

/** Thrown when a human needs to look: a 4xx, a redirect, or an off-allowlist host. */
export class FetchNotRetryable extends Error {}

/**
 * Exported so the allowlist can be tested directly. It is a security control,
 * and one whose failure mode is silent: with the URLs module constants it never
 * fires in normal operation, so nothing but a test would notice it breaking.
 */
export function assertAllowedHost(rawUrl: string): void {
  const { hostname } = new URL(rawUrl);
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new FetchNotRetryable(`host ${hostname} is not on the allowlist`);
  }
}

/**
 * Read the response with a hard ceiling.
 *
 * A malformed or hostile response must not be able to exhaust memory, so the
 * stream is consumed in chunks and abandoned the moment it goes over.
 */
async function readCapped(response: Response): Promise<string> {
  const body = response.body;
  if (body === null) throw new FetchNotRetryable('response had no body');

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        throw new FetchNotRetryable(`response exceeded ${MAX_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function attemptFetch(url: string, userAgent: string): Promise<string> {
  const response = await fetch(url, {
    // Never follow blindly. An off-allowlist redirect target must fail the run,
    // not be chased.
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json', 'user-agent': userAgent },
  });

  if (response.status >= 300 && response.status < 400) {
    throw new FetchNotRetryable(
      `redirect ${response.status} to ${response.headers.get('location') ?? 'unknown'}; the URL moved`,
    );
  }
  // A 4xx means the URL moved or we are being refused. Retrying cannot fix
  // either, and hammering a government site over it is not acceptable.
  if (response.status >= 400 && response.status < 500) {
    throw new FetchNotRetryable(`HTTP ${response.status}; the URL moved or access was refused`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    throw new FetchNotRetryable(`unexpected content-type ${JSON.stringify(contentType)}`);
  }

  return readCapped(response);
}

function backoffMs(attempt: number): number {
  // Exponential with jitter, so repeated failures do not synchronise.
  return BACKOFF_BASE_MS * 2 ** (attempt - 1) * (1 + Math.random());
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch one document, retrying only on 5xx and network errors.
 *
 * `contactUrl` goes into the User-Agent. It is not decoration: the canada.ca CDN
 * answers 403 to a default agent, and identifying yourself on a government site
 * is the deal.
 *
 * One request per run per source, so no rate limiter is needed; the backoff
 * already spaces retries well beyond one per second.
 */
async function fetchDocument(
  canonicalUrl: string,
  contactUrl: string,
  { cacheBust }: { cacheBust: boolean },
): Promise<FetchedPayload> {
  assertAllowedHost(canonicalUrl);
  const userAgent = `MapleTracker/0.1 (+${contactUrl})`;
  // The rounds JSON is a static file behind a CDN that will happily serve a
  // stale copy, so it needs a cache-buster. The news API must NOT have one:
  // verified 2026-08-31 that appending `_=<timestamp>` makes it return zero
  // entries rather than an error, because it reads unknown query parameters as
  // filters. Do not "fix" the asymmetry by busting both.
  const url = cacheBust ? `${canonicalUrl}${canonicalUrl.includes('?') ? '&' : '?'}_=${Date.now()}` : canonicalUrl;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const body = await attemptFetch(url, userAgent);
      return {
        url: canonicalUrl,
        body,
        contentHash: createHash('sha256').update(body).digest('hex'),
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof FetchNotRetryable) throw error;
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt));
    }
  }
  throw new Error(`fetch of ${canonicalUrl} failed after ${MAX_ATTEMPTS} attempts`, { cause: lastError });
}

export function fetchRoundsPayload(contactUrl: string): Promise<FetchedPayload> {
  return fetchDocument(ROUNDS_URL, contactUrl, { cacheBust: true });
}

export function fetchNewsPayload(contactUrl: string): Promise<FetchedPayload> {
  return fetchDocument(NEWS_URL, contactUrl, { cacheBust: false });
}
