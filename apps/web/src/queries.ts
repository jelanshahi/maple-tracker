/**
 * Every read this app makes. The only module here that does I/O.
 *
 * Columns are always listed explicitly. `select('*')` would drag
 * draw_rounds.raw - the entire source payload - into every page render.
 */
import { z } from 'zod';
import { categorySchema, drawRoundSchema, programSchema } from './rows.ts';
import type { Category, DrawRound, Program } from './rows.ts';
import type { ReadClient } from './supabase.ts';

const ROUND_COLUMNS =
  'round_number, drawn_at, round_type, category_code, program_code, cutoff_crs, invitations, tie_break_at, source_url';

/**
 * PostgREST caps an unbounded select at 1000 rows and says nothing about it.
 * There are 438 rounds and the table gains roughly 60 a year, so this is years
 * away - but a tracker whose whole promise is "never silently stale" must not
 * quietly drop history when it arrives. Ask for more than the cap and fail if
 * we ever actually reach it.
 */
const ROUND_LIMIT = 5000;

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error !== null) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) {
    throw new Error(`${what}: succeeded but returned no data`);
  }
  return result.data;
}

/** Newest first. Ordered by drawn_at, never by round_number - IRCC publishes 91a and 91b. */
export async function fetchRounds(client: ReadClient): Promise<DrawRound[]> {
  const rows = must(
    await client.from('draw_rounds').select(ROUND_COLUMNS)
      .order('drawn_at', { ascending: false }).limit(ROUND_LIMIT),
    'read draw rounds',
  );
  const rounds = z.array(drawRoundSchema).parse(rows);
  if (rounds.length >= ROUND_LIMIT) {
    throw new Error(`read draw rounds: hit the ${ROUND_LIMIT} row limit, history is being truncated`);
  }
  return rounds;
}

export async function fetchCategories(client: ReadClient): Promise<Category[]> {
  const rows = must(await client.from('categories').select('code, label'), 'read categories');
  return z.array(categorySchema).parse(rows);
}

export async function fetchPrograms(client: ReadClient): Promise<Program[]> {
  const rows = must(await client.from('programs').select('code, label'), 'read programs');
  return z.array(programSchema).parse(rows);
}

/**
 * When ingestion last confirmed the data against IRCC, or null if that cannot
 * be determined. Null is a real answer, not a failure: the migration granting
 * anon this one column may not be applied yet, and RLS then returns no rows
 * rather than an error. The UI says "unknown" in that case, which is honest -
 * claiming freshness we cannot prove is the thing to avoid.
 */
export async function fetchLastVerifiedAt(client: ReadClient): Promise<string | null> {
  const rows = must(
    await client.from('ingestion_runs').select('finished_at')
      .order('finished_at', { ascending: false, nullsFirst: false }).limit(1),
    'read last verified time',
  );
  const parsed = z.array(z.object({ finished_at: z.string().nullable() })).parse(rows);
  return parsed[0]?.finished_at ?? null;
}
