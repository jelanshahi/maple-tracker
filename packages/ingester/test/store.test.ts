/**
 * Tests for the write layer.
 *
 * This is the one module that cannot be tested without a stand-in, because its
 * whole job is I/O. The stand-in records the query supabase-js was asked to
 * build rather than pretending to be a database, so what these tests pin is the
 * shape of the call: the upsert conflict target, the batching, the ordering,
 * and the fact that an empty batch writes nothing at all.
 *
 * loadConfig needs no stand-in and carries the security assertion that matters
 * most here: a bad configuration must name variables and never echo a value.
 */

import { describe, expect, it } from 'vitest';
import {
  BACKFILL_LIMIT, closeRun, latestSnapshotHash, loadConfig, loadProgramRoundsMissingCode,
  quarantine, upsertRounds, writeProgramCodeBackfill,
} from '../src/store.ts';
import type { Store } from '../src/store.ts';
import type { CandidateRound } from '../src/parse.ts';

type RecordedCall = { table: string; method: string; args: readonly unknown[] };

/**
 * Records the query builder chain and resolves it to a fixed result.
 *
 * Every builder method returns the same object, which is also a thenable, so
 * `from(t).upsert(x).select(y)` records three calls and then awaits to `result`.
 */
function fakeStore(result: { data: unknown; error: { message: string } | null }) {
  const calls: RecordedCall[] = [];
  let table = '';
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  for (const method of ['insert', 'update', 'select', 'eq', 'is', 'order', 'limit', 'upsert', 'single']) {
    builder[method] = (...args: readonly unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
  }
  const store = { from: (name: string) => { table = name; return builder; } };
  return { store: store as unknown as Store, calls };
}

const round = (roundNumber: string): CandidateRound => ({
  round_number: roundNumber,
  drawn_at: '2026-08-19T12:35:37.000Z',
  round_type: 'general',
  category_code: null,
  program_code: null,
  cutoff_crs: 500,
  invitations: 1000,
  tie_break_at: null,
  source_url: 'https://www.canada.ca/example.html',
  raw: {},
});

const validEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
  INGEST_CONTACT_URL: 'https://example.invalid/contact',
};

describe('loadConfig', () => {
  it('maps the three variables it needs', () => {
    expect(loadConfig(validEnv)).toEqual({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key-value',
      contactUrl: 'https://example.invalid/contact',
    });
  });

  it.each([
    ['SUPABASE_URL', { ...validEnv, SUPABASE_URL: undefined }],
    ['SUPABASE_SERVICE_ROLE_KEY', { ...validEnv, SUPABASE_SERVICE_ROLE_KEY: undefined }],
    ['INGEST_CONTACT_URL', { ...validEnv, INGEST_CONTACT_URL: undefined }],
  ])('fails at startup naming %s when it is missing', (name, env) => {
    expect(() => loadConfig(env)).toThrow(new RegExp(name));
  });

  it('rejects a url that is not a url', () => {
    expect(() => loadConfig({ ...validEnv, SUPABASE_URL: 'project.supabase.co' })).toThrow(/SUPABASE_URL/);
  });

  it('rejects an empty service role key rather than starting without one', () => {
    expect(() => loadConfig({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  /**
   * The one test in this file that is about consequences rather than contract.
   * Config errors get logged and pasted into issues; a key echoed into one is a
   * key that has to be rotated.
   */
  it('never puts a secret value in the error message', () => {
    const secret = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super-secret-service-role';
    let message = '';
    try {
      loadConfig({ ...validEnv, SUPABASE_URL: 'not a url', SUPABASE_SERVICE_ROLE_KEY: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('SUPABASE_URL');
    expect(message).not.toContain(secret);
    expect(message).not.toContain('super-secret');
    expect(message).not.toContain('not a url');
  });
});

describe('upsertRounds', () => {
  it('writes the whole batch in one call, keyed on round_number', async () => {
    const { store, calls } = fakeStore({ data: [{ round_number: '437' }], error: null });
    const written = await upsertRounds(store, [round('437'), round('91a'), round('91b')]);

    expect(written).toBe(3);
    const upsert = calls.find((call) => call.method === 'upsert');
    expect(upsert?.table).toBe('draw_rounds');
    // Idempotency lives entirely in this option. Without it a second run
    // duplicates every round instead of recording no_change.
    expect(upsert?.args[1]).toEqual({ onConflict: 'round_number' });
    expect(upsert?.args[0]).toHaveLength(3);
    // One call for 438 rows on a backfill, not 438 calls.
    expect(calls.filter((call) => call.method === 'upsert')).toHaveLength(1);
  });

  it('writes nothing at all for an empty batch', async () => {
    const { store, calls } = fakeStore({ data: [], error: null });
    expect(await upsertRounds(store, [])).toBe(0);
    expect(calls).toEqual([]);
  });

  it('throws with context when the database refuses the write', async () => {
    const { store } = fakeStore({ data: null, error: { message: 'violates check constraint' } });
    await expect(upsertRounds(store, [round('437')])).rejects.toThrow(/upsert draw rounds: violates check constraint/);
  });
});

describe('quarantine', () => {
  it('stamps every row with the run that produced it', async () => {
    const { store, calls } = fakeStore({ data: [{ id: 1 }], error: null });
    await quarantine(store, 42, [
      { reason: 'cutoff_crs 9999 outside 0..1200', payload: { drawNumber: '999' } },
      { reason: 'unknown category', payload: { drawNumber: '998' } },
    ]);

    const insert = calls.find((call) => call.method === 'insert');
    expect(insert?.table).toBe('quarantined_rows');
    expect(insert?.args[0]).toEqual([
      { run_id: 42, reason: 'cutoff_crs 9999 outside 0..1200', payload: { drawNumber: '999' } },
      { run_id: 42, reason: 'unknown category', payload: { drawNumber: '998' } },
    ]);
  });

  it('writes nothing when there is nothing to quarantine', async () => {
    const { store, calls } = fakeStore({ data: [], error: null });
    await quarantine(store, 42, []);
    expect(calls).toEqual([]);
  });
});

describe('latestSnapshotHash', () => {
  it('takes the newest snapshot for that url', async () => {
    const { store, calls } = fakeStore({ data: [{ content_hash: 'abc123' }], error: null });
    expect(await latestSnapshotHash(store, 'https://www.canada.ca/rounds.json')).toBe('abc123');

    expect(calls.find((call) => call.method === 'eq')?.args).toEqual(['url', 'https://www.canada.ca/rounds.json']);
    // Newest first, one row. Ascending order here would compare against the
    // oldest body and make every run look changed.
    expect(calls.find((call) => call.method === 'order')?.args).toEqual(['fetched_at', { ascending: false }]);
    expect(calls.find((call) => call.method === 'limit')?.args).toEqual([1]);
  });

  it('returns null on the very first run rather than throwing', async () => {
    const { store } = fakeStore({ data: [], error: null });
    expect(await latestSnapshotHash(store, 'https://www.canada.ca/rounds.json')).toBeNull();
  });
});

describe('closeRun', () => {
  it('records the outcome and stamps a finish time', async () => {
    const { store, calls } = fakeStore({ data: [{ id: 7 }], error: null });
    await closeRun(store, 7, { status: 'ok', rowsSeen: 438, rowsWritten: 438 });

    const update = calls.find((call) => call.method === 'update');
    expect(update?.table).toBe('ingestion_runs');
    expect(update?.args[0]).toMatchObject({ status: 'ok', rows_seen: 438, rows_written: 438, error: null });
    expect(calls.find((call) => call.method === 'eq')?.args).toEqual(['id', 7]);
  });

  it('nulls the counts it was not given instead of defaulting them to zero', async () => {
    const { store, calls } = fakeStore({ data: [{ id: 8 }], error: null });
    await closeRun(store, 8, { status: 'failed', error: 'fetch failed' });

    // A failed run that never counted rows is not a run that saw zero rows.
    expect(calls.find((call) => call.method === 'update')?.args[0]).toMatchObject({
      status: 'failed',
      rows_seen: null,
      rows_written: null,
      error: 'fetch failed',
    });
  });

  it('throws when a write claims success but returns nothing', async () => {
    const { store } = fakeStore({ data: null, error: null });
    await expect(closeRun(store, 9, { status: 'ok' })).rejects.toThrow(/returned no data/);
  });
});

const programBackfillRow = {
  round_number: '436',
  raw: { drawName: 'Canadian Experience Class' },
};

describe('loadProgramRoundsMissingCode', () => {
  it('reads only the two columns the backfill derives from', async () => {
    const { store, calls } = fakeStore({ data: [programBackfillRow], error: null });
    const rows = await loadProgramRoundsMissingCode(store);

    expect(rows).toEqual([programBackfillRow]);
    const select = calls.find((call) => call.method === 'select');
    expect(select?.table).toBe('draw_rounds');
    expect(select?.args).toEqual(['round_number, raw']);
    expect(calls.find((call) => call.method === 'eq')?.args).toEqual(['round_type', 'program']);
    expect(calls.find((call) => call.method === 'is')?.args).toEqual(['program_code', null]);
  });

  it('bounds the read rather than trusting PostgREST not to truncate it', async () => {
    const { store, calls } = fakeStore({ data: [programBackfillRow], error: null });
    await loadProgramRoundsMissingCode(store);
    expect(calls.find((call) => call.method === 'limit')?.args).toEqual([BACKFILL_LIMIT]);
  });

  it('throws rather than silently backfilling only the first page', async () => {
    // A truncated read reports skipped: 0 and exits 0, which an operator reads
    // as "complete" - and then the not-null constraint aborts on the rows the
    // backfill never saw.
    const full = Array.from({ length: BACKFILL_LIMIT }, (_, index) => ({
      round_number: String(index),
      raw: { drawName: 'Canadian Experience Class' },
    }));
    const { store } = fakeStore({ data: full, error: null });
    await expect(loadProgramRoundsMissingCode(store)).rejects.toThrow(/row limit/);
  });
});

describe('writeProgramCodeBackfill', () => {
  it('updates only program_code, keyed on round_number', async () => {
    // An upsert would have to send every other column back with it, turning a
    // one-column backfill into a read-modify-write that can revert a
    // concurrent ingest correction. update() cannot clobber what it omits.
    const { store, calls } = fakeStore({ data: [{ round_number: '436' }], error: null });
    const written = await writeProgramCodeBackfill(store, [{ round_number: '436', program_code: 'cec' }]);

    expect(written).toBe(1);
    const update = calls.find((call) => call.method === 'update');
    expect(update?.table).toBe('draw_rounds');
    expect(update?.args).toEqual([{ program_code: 'cec' }]);
    expect(calls.find((call) => call.method === 'eq')?.args).toEqual(['round_number', '436']);
    expect(calls.some((call) => call.method === 'upsert')).toBe(false);
  });

  it('updates each row in the batch', async () => {
    const { store, calls } = fakeStore({ data: [{ round_number: 'x' }], error: null });
    const written = await writeProgramCodeBackfill(store, [
      { round_number: '436', program_code: 'cec' },
      { round_number: '435', program_code: 'pnp' },
    ]);

    expect(written).toBe(2);
    expect(calls.filter((call) => call.method === 'update').map((call) => call.args[0])).toEqual([
      { program_code: 'cec' },
      { program_code: 'pnp' },
    ]);
    expect(calls.filter((call) => call.method === 'eq').map((call) => call.args)).toEqual([
      ['round_number', '436'],
      ['round_number', '435'],
    ]);
  });

  it('writes nothing for an empty batch', async () => {
    const { store, calls } = fakeStore({ data: [], error: null });
    expect(await writeProgramCodeBackfill(store, [])).toBe(0);
    expect(calls).toEqual([]);
  });
});
