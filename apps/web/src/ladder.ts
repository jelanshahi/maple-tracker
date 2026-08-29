/**
 * The cut-off ladder: where each stream's line currently sits, and which way it
 * last moved.
 *
 * A "stream" is the category where a round has one, and the round type where it
 * does not. Keying the ladder on categories alone was the obvious reading of
 * ARCHITECTURE.md section 9 and it is wrong: 186 program rounds and 178 general
 * rounds carry no category_code at all, and the most recent program round is
 * newer than eight of the ten categories. A ladder that omitted it would hide
 * the largest group of draws from the page whose job is to show the lines.
 */
import type { Category, DrawRound } from './rows.ts';

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
 * round_type 'program' is a bucket, not a stream. It mixes Canadian Experience
 * Class rounds, which cut off around 520, with Provincial Nominee Program
 * rounds, which cut off around 760 because a nomination is worth 600 points on
 * its own. Differencing consecutive rounds across those two produced a headline
 * movement of -237 points that describes nothing that happened.
 *
 * The programs are distinguishable only inside raw.drawName, and normalising
 * IRCC's free text into stable codes is the ingester's job, not this app's -
 * doing it here would duplicate that responsibility and drift from it. Until
 * draw_rounds carries a column for the program, the honest move is to withhold
 * the number rather than print a confident wrong one.
 */
const HETEROGENEOUS_STREAMS = new Set(['program']);

export function streamKey(round: DrawRound): string {
  return round.category_code ?? round.round_type;
}

const UNCATEGORISED_LABELS: Record<string, string> = {
  general: 'General (all programs)',
  program: 'Program-specific',
};

/**
 * An unknown code renders as itself rather than as a guess. Categories get
 * added by IRCC faster than seeds do, and inventing a label would be inventing
 * a fact.
 */
function labelFor(key: string, categoryLabels: ReadonlyMap<string, string>): string {
  return categoryLabels.get(key) ?? UNCATEGORISED_LABELS[key] ?? key;
}

function byDrawnAtDescending(a: DrawRound, b: DrawRound): number {
  return b.drawn_at.localeCompare(a.drawn_at);
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
): LadderEntry[] {
  const categoryLabels = new Map(categories.map((category) => [category.code, category.label]));
  const entries: LadderEntry[] = [];

  for (const [key, group] of groupByStream(rounds)) {
    const sorted = [...group].sort(byDrawnAtDescending);
    const latest = sorted[0];
    if (latest === undefined) continue;
    const previous = sorted[1] ?? null;
    const comparable = !HETEROGENEOUS_STREAMS.has(key);
    entries.push({
      key,
      label: labelFor(key, categoryLabels),
      latest,
      previous,
      change: previous === null || !comparable ? null : latest.cutoff_crs - previous.cutoff_crs,
      comparable,
      roundCount: sorted.length,
    });
  }

  return entries.sort((a, b) => byDrawnAtDescending(a.latest, b.latest));
}
