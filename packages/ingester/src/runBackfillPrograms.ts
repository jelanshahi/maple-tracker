/**
 * Orchestrates the one-off program_code backfill: read, derive, write, log.
 */
import { logEvent } from './log.ts';
import { loadProgramRoundsMissingCode, writeProgramCodeBackfill } from './store.ts';
import type { Store } from './store.ts';
import { planProgramCodeBackfill } from './backfillPrograms.ts';

export type BackfillResult = { updated: number; skipped: number };

export async function runProgramCodeBackfill(store: Store): Promise<BackfillResult> {
  const rows = await loadProgramRoundsMissingCode(store);
  const { updates, skipped } = planProgramCodeBackfill(rows);

  for (const skip of skipped) {
    logEvent('backfill.program_code.skipped', null, { roundNumber: skip.round_number, reason: skip.reason });
  }

  const byRoundNumber = new Map(rows.map((row) => [row.round_number, row]));
  const fullUpdates = updates.flatMap((update) => {
    const row = byRoundNumber.get(update.round_number);
    // Every update came from planProgramCodeBackfill(rows), so its
    // round_number is always present here - this is a defensive guard
    // against Map/array drift, not an expected runtime path.
    if (row === undefined) return [];
    return [{ ...row, program_code: update.program_code }];
  });

  const updated = await writeProgramCodeBackfill(store, fullUpdates);
  logEvent('backfill.program_code.finished', null, { rowsSeen: rows.length, updated, skipped: skipped.length });
  return { updated, skipped: skipped.length };
}
