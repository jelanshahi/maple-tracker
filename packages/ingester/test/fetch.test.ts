/**
 * Tests for the only outbound network call in the project.
 *
 * No test here touches the network: global fetch is stubbed, so what is under
 * test is our handling of a response rather than canada.ca's behaviour. Timers
 * are faked because the retry ladder sleeps for seconds of jittered backoff.
 *
 * Every case below is a rule from CLAUDE.md that would otherwise only be
 * enforced by a comment: never follow a redirect, never retry a 4xx, never read
 * an unbounded body, always identify ourselves.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { assertAllowedHost, FetchNotRetryable, fetchRoundsPayload } from '../src/fetch.ts';

const CONTACT = 'https://example.invalid/maple-tracker';
const PAYLOAD = '{"rounds":[]}';
const ROUNDS_URL = 'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

/** A stub standing in for global fetch, returning each response in turn. */
function stubFetch(...responses: ReadonlyArray<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchStub = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fetchStub);
  return calls;
}

/**
 * Run to completion under fake timers, capturing the outcome either way.
 *
 * Capturing rather than rethrowing matters: the promise has to stay handled
 * while the timers advance, or the retry cases surface as unhandled rejections.
 */
async function settle<T>(operation: () => Promise<T>): Promise<{ value?: T; error?: unknown }> {
  vi.useFakeTimers();
  const outcome: { value?: T; error?: unknown } = {};
  const running = operation().then(
    (value) => { outcome.value = value; },
    (error: unknown) => { outcome.error = error; },
  );
  // Comfortably past the 1-2s and 2-4s jittered backoffs.
  await vi.advanceTimersByTimeAsync(30_000);
  await running;
  vi.useRealTimers();
  return outcome;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the allowlist', () => {
  it('accepts the one host we read from', () => {
    expect(() => assertAllowedHost('https://www.canada.ca/anything.json')).not.toThrow();
  });

  it.each([
    ['an unlisted subdomain', 'https://ircc.canada.ca/x.json'],
    ['the bare domain', 'https://canada.ca/x.json'],
    ['a lookalike domain', 'https://www.canada.ca.evil.test/x.json'],
    ['a userinfo prefix', 'https://www.canada.ca@evil.test/x.json'],
    ['an unrelated site', 'https://example.test/x.json'],
  ])('rejects %s', (_label, url) => {
    expect(() => assertAllowedHost(url)).toThrow(FetchNotRetryable);
  });
});

describe('a successful fetch', () => {
  it('returns the body with its sha256 and the canonical url', async () => {
    stubFetch(new Response(PAYLOAD, { headers: jsonHeaders }));
    const { value } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(value?.body).toBe(PAYLOAD);
    expect(value?.contentHash).toBe(createHash('sha256').update(PAYLOAD).digest('hex'));
    // The stored url must not carry the cache-buster, or every run looks new.
    expect(value?.url).toBe(ROUNDS_URL);
    expect(value?.url).not.toContain('?');
    expect(Number.isFinite(Date.parse(value?.fetchedAt ?? ''))).toBe(true);
  });

  it('hashes identical bodies identically and different bodies differently', async () => {
    stubFetch(new Response(PAYLOAD, { headers: jsonHeaders }));
    const first = await settle(() => fetchRoundsPayload(CONTACT));
    vi.unstubAllGlobals();
    stubFetch(new Response(PAYLOAD, { headers: jsonHeaders }));
    const again = await settle(() => fetchRoundsPayload(CONTACT));
    vi.unstubAllGlobals();
    stubFetch(new Response('{"rounds":[1]}', { headers: jsonHeaders }));
    const other = await settle(() => fetchRoundsPayload(CONTACT));

    // Hash-before-parse is what makes a second run a no-change run.
    expect(again.value?.contentHash).toBe(first.value?.contentHash);
    expect(other.value?.contentHash).not.toBe(first.value?.contentHash);
  });

  it('requests the allowlisted host over https, unredirected and identified', async () => {
    const calls = stubFetch(new Response(PAYLOAD, { headers: jsonHeaders }));
    await settle(() => fetchRoundsPayload(CONTACT));

    const call = calls[0];
    if (call === undefined) throw new Error('no request was made');
    const requested = new URL(call.url);
    expect(requested.protocol).toBe('https:');
    expect(requested.hostname).toBe('www.canada.ca');
    // Cache-buster, or the CDN serves a stale copy and staleness goes unseen.
    expect(requested.searchParams.get('_')).toMatch(/^\d+$/);

    expect(call.init.redirect).toBe('manual');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['user-agent']).toContain(CONTACT);
    expect(headers.accept).toBe('application/json');
  });
});

describe('responses a human needs to look at', () => {
  it.each([
    ['a 404', 404],
    ['a 403', 403],
    ['a 429', 429],
  ])('does not retry %s', async (_label, status) => {
    const calls = stubFetch(new Response('nope', { status }));
    const { error } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(error).toBeInstanceOf(FetchNotRetryable);
    // Hammering a government site over a 4xx is not acceptable, and cannot help.
    expect(calls).toHaveLength(1);
  });

  it('fails on a redirect rather than following it', async () => {
    const calls = stubFetch(
      new Response(null, { status: 301, headers: { location: 'https://evil.test/rounds.json' } }),
    );
    const { error } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(error).toBeInstanceOf(FetchNotRetryable);
    expect((error as Error).message).toContain('https://evil.test/rounds.json');
    expect(calls).toHaveLength(1);
    // The redirect target was never requested. That is the whole point.
    expect(calls.map((call) => call.url)).not.toContain('https://evil.test/rounds.json');
  });

  it('rejects a non-json content-type without parsing it', async () => {
    const calls = stubFetch(new Response('<html>maintenance</html>', { headers: { 'content-type': 'text/html' } }));
    const { error } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(error).toBeInstanceOf(FetchNotRetryable);
    expect((error as Error).message).toContain('text/html');
    expect(calls).toHaveLength(1);
  });

  it('rejects a response with no body', async () => {
    stubFetch(new Response(null, { status: 200, headers: jsonHeaders }));
    const { error } = await settle(() => fetchRoundsPayload(CONTACT));
    expect(error).toBeInstanceOf(FetchNotRetryable);
  });
});

describe('the size cap', () => {
  /** Yields 1 MB at a time so the test can count how far the reader got. */
  function oversizedResponse(): { response: Response; chunksPulled: () => number } {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 20) controller.close();
        else controller.enqueue(new Uint8Array(1024 * 1024).fill(0x20));
      },
    });
    return { response: new Response(stream, { headers: jsonHeaders }), chunksPulled: () => pulled };
  }

  it('abandons a response past 10 MB instead of buffering it', async () => {
    const { response, chunksPulled } = oversizedResponse();
    stubFetch(response);
    const { error } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(error).toBeInstanceOf(FetchNotRetryable);
    expect((error as Error).message).toContain('exceeded');
    // Stopped just past the ceiling rather than reading all 20 MB, which is the
    // difference between a rejected response and an exhausted process.
    expect(chunksPulled()).toBeLessThanOrEqual(12);
  });
});

describe('retrying', () => {
  it('retries a 5xx and succeeds when the site recovers', async () => {
    const calls = stubFetch(
      new Response('oops', { status: 503 }),
      new Response(PAYLOAD, { headers: jsonHeaders }),
    );
    const { value, error } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(error).toBeUndefined();
    expect(value?.body).toBe(PAYLOAD);
    expect(calls).toHaveLength(2);
  });

  it('retries a network error', async () => {
    const calls = stubFetch(new TypeError('fetch failed'), new Response(PAYLOAD, { headers: jsonHeaders }));
    const { value } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(value?.body).toBe(PAYLOAD);
    expect(calls).toHaveLength(2);
  });

  it('gives up after three attempts, keeping the last error as the cause', async () => {
    const calls = stubFetch(new Response('down', { status: 500 }));
    const { error } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(calls).toHaveLength(3);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(FetchNotRetryable);
    expect((error as Error).message).toContain('3 attempts');
    // The cause is what tells an operator whether it was a 500 or a dropped
    // connection, so losing it turns a diagnosable failure into a mystery.
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
  });

  it('stops retrying the moment a retryable failure turns into a 4xx', async () => {
    const calls = stubFetch(new Response('down', { status: 500 }), new Response('gone', { status: 404 }));
    const { error } = await settle(() => fetchRoundsPayload(CONTACT));

    expect(error).toBeInstanceOf(FetchNotRetryable);
    expect(calls).toHaveLength(2);
  });
});

describe('the user agent', () => {
  it('carries the contact url it is given, never a hardcoded one', async () => {
    const calls = stubFetch(new Response(PAYLOAD, { headers: jsonHeaders }));
    await settle(() => fetchRoundsPayload('https://other.invalid/contact'));

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['user-agent']).toBe('MapleTracker/0.1 (+https://other.invalid/contact)');
  });
});
