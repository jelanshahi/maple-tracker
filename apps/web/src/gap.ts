/**
 * Where a score sits against the most recent published cut-off in each stream.
 *
 * These are past rounds and nothing else. ARCHITECTURE.md section 7: state
 * facts, show gaps, link to IRCC - never a prediction and never a
 * recommendation about anybody's case. IRPA s.91 makes that a legal boundary
 * rather than an editorial one.
 *
 * Pure, and deliberately narrow: buildLadder has already done the grouping, so
 * this only projects it down to what the table renders. That keeps the payload
 * sent to the browser to the handful of public fields shown on screen.
 */
import type { LadderEntry } from './ladder.ts';

export type CutoffMark = {
  key: string;
  label: string;
  cutoffCrs: number;
  roundNumber: string;
  drawnAt: string;
  sourceUrl: string;
  /** False where consecutive rounds in this stream are not like for like. */
  comparable: boolean;
};

/**
 * Provincial nomination is worth 600 points on its own, and these rounds invite
 * only candidates who already hold one. The arithmetic against a profile
 * without a nomination is correct and useless, so the table says so beside it.
 */
export const NOMINATION_STREAM_KEY = 'pnp';

export type ScoreGap = {
  mark: CutoffMark;
  /** Points above (positive) or below (negative) that cut-off, or null where the comparison is not honest. */
  difference: number | null;
};

export function toCutoffMarks(ladder: readonly LadderEntry[]): CutoffMark[] {
  return ladder.map((entry) => ({
    key: entry.key,
    label: entry.label,
    cutoffCrs: entry.latest.cutoff_crs,
    roundNumber: entry.latest.round_number,
    drawnAt: entry.latest.drawn_at,
    sourceUrl: entry.latest.source_url,
    comparable: entry.comparable,
  }));
}

/**
 * Lowest cut-off first, so the difference column runs from most positive to
 * most negative and can be read down in one pass. Streams whose rounds are not
 * like for like sort last and show no difference at all: the generic 'program'
 * bucket mixes streams hundreds of points apart, and withholding a number while
 * saying why beats printing a confident wrong one.
 */
export function gapsFor(total: number, marks: readonly CutoffMark[]): ScoreGap[] {
  return marks
    .map((mark) => ({ mark, difference: mark.comparable ? total - mark.cutoffCrs : null }))
    .sort((a, b) => {
      if (a.mark.comparable !== b.mark.comparable) return a.mark.comparable ? -1 : 1;
      return a.mark.cutoffCrs - b.mark.cutoffCrs;
    });
}
