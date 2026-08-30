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

  const updated = await writeProgramCodeBackfill(store, updates);
  logEvent('backfill.program_code.finished', null, { rowsSeen: rows.length, updated, skipped: skipped.length });
  return { updated, skipped: skipped.length };
}
