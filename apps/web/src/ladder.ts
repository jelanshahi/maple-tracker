/**
 * The cut-off ladder: where each stream's line currently sits, and which way it
 * last moved.
 *
 * A "stream" is the category when a round has one, the program when it names
 * one, and the round type when it has neither. Keying the ladder on categories
 * alone was the obvious reading of ARCHITECTURE.md section 9 and it is wrong:
 * 186 program rounds and 178 general rounds carry no category_code at all, and
 * the most recent program round is newer than eight of the ten categories. A
 * ladder that omitted it would hide the largest group of draws from the page
 * whose job is to show the lines.
 */
import { UNCATEGORISED_LABELS, mergeStreamLabels } from './format.ts';
import type { Category, DrawRound, Program } from './rows.ts';

export type LadderEntry = {
  key: string;
  label: string;
  latest: DrawRound;
  previous: DrawRound | null;
  /** Points the cut-off moved since the previous round of this stream, where that means anything. */
  change: number | null;
  /** False where consecutive rounds are not like for like. See HETEROGENEOUS_STREAMS. */
  comparable: boolean;
  roundCount: number;
};

/**
 * A round not yet carrying a program_code falls back to the generic 'program'
 * bucket, which mixes programs whose cut-offs are not on the same scale (a
 * provincial nomination is worth 600 points by itself). That bucket is empty
 * once the ingester backfill and its not-null constraint (see
 * supabase/migrations/20260829220000_programs_not_null.sql) have run; this
 * stays as the honest fallback rather than an assumption that they always
 * have.
 */
const HETEROGENEOUS_STREAMS = new Set(['program']);

export function streamKey(round: DrawRound): string {
  return round.category_code ?? round.program_code ?? round.round_type;
}

/**
 * An unknown code renders as itself rather than as a guess. Categories and
 * programs both get added by IRCC faster than seeds do, and inventing a label
 * would be inventing a fact.
 */
function labelFor(key: string, streamLabels: ReadonlyMap<string, string>): string {
  return streamLabels.get(key) ?? UNCATEGORISED_LABELS[key] ?? key;
}

function byDrawnAtDescending(a: DrawRound, b: DrawRound): number {
  return b.drawn_at.localeCompare(a.drawn_at);
}

/**
 * The round a given round should be compared against: the most recent round of
 * the same stream drawn strictly before it.
 *
 * Strictly before, by timestamp rather than by position, because round_number
 * is text and not monotonic - 91a and 91b are one day's two rounds - so
 * "the row above this one" is not a definition that survives contact with the
 * data. A round is never its own predecessor even when another round shares its
 * instant.
 */
export function previousInStream(rounds: readonly DrawRound[], round: DrawRound): DrawRound | null {
  const key = streamKey(round);
  return (
    rounds
      .filter((other) => streamKey(other) === key && other.drawn_at < round.drawn_at)
      .sort(byDrawnAtDescending)[0] ?? null
  );
}

function groupByStream(rounds: readonly DrawRound[]): Map<string, DrawRound[]> {
  const groups = new Map<string, DrawRound[]>();
  for (const round of rounds) {
    const key = streamKey(round);
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [round]);
    else existing.push(round);
  }
  return groups;
}

/**
 * Newest stream first. Sorts defensively rather than trusting the caller's
 * order, so a fixture does not have to be pre-sorted to be a fair test.
 */
export function buildLadder(
  rounds: readonly DrawRound[],
  categories: readonly Category[],
  programs: readonly Program[],
): LadderEntry[] {
  const streamLabels = mergeStreamLabels(categories, programs);
  const entries: LadderEntry[] = [];

  for (const [key, group] of groupByStream(rounds)) {
    const sorted = [...group].sort(byDrawnAtDescending);
    const latest = sorted[0];
    if (latest === undefined) continue;
    const previous = sorted[1] ?? null;
    const comparable = !HETEROGENEOUS_STREAMS.has(key);
    entries.push({
      key,
      label: labelFor(key, streamLabels),
      latest,
      previous,
      change: previous === null || !comparable ? null : latest.cutoff_crs - previous.cutoff_crs,
      comparable,
      roundCount: sorted.length,
    });
  }

  return entries.sort((a, b) => byDrawnAtDescending(a.latest, b.latest));
}
