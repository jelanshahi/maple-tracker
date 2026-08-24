/**
 * The only outbound network call in the project.
 *
 * Every constraint here is a requirement from CLAUDE.md, not a preference.
 * The URL is a module constant: nothing from the database or from a parsed
 * response is ever interpolated into a fetch target, which is what closes the
 * SSRF surface outright.
 */

import { createHash } from 'node:crypto';

/** Unlisted subdomains are rejected too. */
const ALLOWED_HOSTS = new Set(['www.canada.ca']);

const ROUNDS_URL = 'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';

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
 * and one whose failure mode is silent: with the URL a module constant it never
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
 * Fetch the rounds payload, retrying only on 5xx and network errors.
 *
 * `contactUrl` goes into the User-Agent. It is not decoration: the canada.ca CDN
 * answers 403 to a default agent, and identifying yourself on a government site
 * is the deal.
 *
 * Only one request is made per run, so no rate limiter is needed; the backoff
 * below already spaces retries well beyond one per second.
 */
export async function fetchRoundsPayload(contactUrl: string): Promise<FetchedPayload> {
  assertAllowedHost(ROUNDS_URL);
  const userAgent = `MapleTracker/0.1 (+${contactUrl})`;
  // Cache-buster: the JSON sits behind a CDN that would otherwise serve a stale copy.
  const url = `${ROUNDS_URL}?_=${Date.now()}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const body = await attemptFetch(url, userAgent);
      return {
        url: ROUNDS_URL,
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
  throw new Error(`rounds fetch failed after ${MAX_ATTEMPTS} attempts`, { cause: lastError });
}
