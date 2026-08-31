/**
 * A user's own past estimates, newest first, with the movement between them.
 *
 * Pure. The rows come from the caller, so this is testable without a database.
 *
 * These are estimates this site produced, not IRCC scores, and the page says
 * so. The movement is arithmetic between two of the user's own saves - it
 * describes what they changed, and never what IRCC will do.
 */
import type { Assessment } from './rows.ts';

export type HistoryEntry = {
  id: number;
  total: number;
  ruleSetId: string;
  createdAt: string;
  /** Points moved since the entry before this one, or null for the first ever. */
  change: number | null;
};

/**
 * Newest first, with each entry compared against the one before it in time.
 *
 * Sorts defensively rather than trusting the caller's order, so a fixture does
 * not have to be pre-sorted to be a fair test - the same reasoning as
 * buildLadder in ladder.ts.
 *
 * Two saves in the same second are ordered by id, which is monotonic. Without
 * that tie-break the pair could swap between renders and the movement column
 * would flip sign for no reason.
 */
export function buildHistory(assessments: readonly Assessment[]): HistoryEntry[] {
  const oldestFirst = [...assessments].sort((a, b) => {
    const byTime = a.created_at.localeCompare(b.created_at);
    return byTime === 0 ? a.id - b.id : byTime;
  });

  const entries = oldestFirst.map((assessment, index) => {
    const previous = index === 0 ? null : oldestFirst[index - 1];
    return {
      id: assessment.id,
      total: assessment.total,
      ruleSetId: assessment.rule_set_id,
      createdAt: assessment.created_at,
      // Only comparable within one rule set. A total scored under crs-2024 and
      // one scored under crs-current are not the same measurement, and
      // differencing them would print a movement that describes a rule change
      // as if it were a change in the person. ARCHITECTURE.md section 7.5.
      change: previous === undefined || previous === null || previous.rule_set_id !== assessment.rule_set_id
        ? null
        : assessment.total - previous.total,
    };
  });

  return entries.reverse();
}
