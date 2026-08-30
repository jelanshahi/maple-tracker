/**
 * All database writes. The only module that touches the service role key.
 *
 * That key bypasses RLS, so its blast radius is deliberately one file. It is
 * never logged, never returned, and never put into an error message - the
 * config check below reports variable NAMES only.
 *
 * supabase-js parameterises every query. No SQL is built by hand here, and no
 * parsed value is ever concatenated into a statement.
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from './database.types.ts';
import type { CandidateRound } from './parse.ts';

export type Store = SupabaseClient<Database>;

const isUrl = (value: string): boolean => URL.canParse(value);

const configSchema = z.object({
  SUPABASE_URL: z.string().refine(isUrl),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  INGEST_CONTACT_URL: z.string().refine(isUrl),
});

export type Config = {
  supabaseUrl: string;
  serviceRoleKey: string;
  contactUrl: string;
};

/**
 * Validated at startup so a missing key fails immediately rather than at 3 a.m.
 * halfway through a run.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`missing or invalid environment variables: ${names}`);
  }
  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    contactUrl: parsed.data.INGEST_CONTACT_URL,
  };
}

export function createStore(config: Config): Store {
  return createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Throws on any database error so the top-level handler decides what to do. */
function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error !== null) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) {
    throw new Error(`${what}: succeeded but returned no data`);
  }
  return result.data;
}

export async function openRun(store: Store): Promise<number> {
  const row = must(
    await store.from('ingestion_runs').insert({ status: 'running' }).select('id').single(),
    'open ingestion run',
  );
  return row.id;
}

export async function closeRun(
  store: Store,
  runId: number,
  fields: { status: 'ok' | 'no_change' | 'failed' | 'quarantined'; rowsSeen?: number; rowsWritten?: number; error?: string },
): Promise<void> {
  must(
    await store.from('ingestion_runs').update({
      status: fields.status,
      finished_at: new Date().toISOString(),
      rows_seen: fields.rowsSeen ?? null,
      rows_written: fields.rowsWritten ?? null,
      error: fields.error ?? null,
    }).eq('id', runId).select('id'),
    'close ingestion run',
  );
}

/** The hash of the newest snapshot for this URL, or null if there is none. */
export async function latestSnapshotHash(store: Store, url: string): Promise<string | null> {
  const rows = must(
    await store.from('source_snapshots').select('content_hash')
      .eq('url', url).order('fetched_at', { ascending: false }).limit(1),
    'read latest snapshot',
  );
  return rows[0]?.content_hash ?? null;
}

export async function writeSnapshot(
  store: Store,
  snapshot: { url: string; body: string; contentHash: string; fetchedAt: string },
): Promise<void> {
  must(
    await store.from('source_snapshots').insert({
      url: snapshot.url,
      body: snapshot.body,
      content_hash: snapshot.contentHash,
      fetched_at: snapshot.fetchedAt,
    }).select('id'),
    'write source snapshot',
  );
}

/** Existing rounds, keyed by round number, for the mutation guard. */
export async function loadExistingRounds(
  store: Store,
): Promise<Map<string, { cutoff_crs: number; invitations: number; drawn_at: string }>> {
  const rows = must(
    await store.from('draw_rounds').select('round_number, cutoff_crs, invitations, drawn_at'),
    'read existing rounds',
  );
  return new Map(rows.map((row) => [row.round_number, row]));
}

/** One call for the whole batch, not one per row - this matters on a 438-row backfill. */
export async function upsertRounds(store: Store, rounds: readonly CandidateRound[]): Promise<number> {
  if (rounds.length === 0) return 0;
  must(
    await store.from('draw_rounds').upsert([...rounds], { onConflict: 'round_number' }).select('round_number'),
    'upsert draw rounds',
  );
  return rounds.length;
}

export type ProgramBackfillRow = Pick<
  Database['public']['Tables']['draw_rounds']['Row'],
  'round_number' | 'drawn_at' | 'round_type' | 'category_code' | 'cutoff_crs' | 'invitations' | 'tie_break_at' | 'source_url' | 'raw'
>;

const PROGRAM_BACKFILL_COLUMNS =
  'round_number, drawn_at, round_type, category_code, cutoff_crs, invitations, tie_break_at, source_url, raw';

/**
 * Program rounds that still need a program_code, for the one-off backfill.
 * Reads the whole row (not just round_number/raw) because supabase-js's
 * upsert typing requires every column the generated Insert type marks
 * required - see the Task 7 design note above.
 */
export async function loadProgramRoundsMissingCode(store: Store): Promise<ProgramBackfillRow[]> {
  const rows = must(
    await store.from('draw_rounds').select(PROGRAM_BACKFILL_COLUMNS)
      .eq('round_type', 'program').is('program_code', null),
    'read program rounds missing a program code',
  );
  return rows;
}

/** One call for the whole batch, same shape as upsertRounds. */
export async function writeProgramCodeBackfill(
  store: Store,
  rows: readonly (ProgramBackfillRow & { program_code: string })[],
): Promise<number> {
  if (rows.length === 0) return 0;
  must(
    await store.from('draw_rounds').upsert([...rows], { onConflict: 'round_number' }).select('round_number'),
    'write program code backfill',
  );
  return rows.length;
}

export async function quarantine(
  store: Store,
  runId: number,
  rows: readonly { reason: string; payload: Json }[],
): Promise<void> {
  if (rows.length === 0) return;
  must(
    await store.from('quarantined_rows')
      .insert(rows.map((row) => ({ run_id: runId, reason: row.reason, payload: row.payload })))
      .select('id'),
    'write quarantined rows',
  );
}
