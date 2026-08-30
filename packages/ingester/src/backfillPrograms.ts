/**
 * Backfill program_code on existing draw_rounds from their own stored raw
 * payload. A one-off, run once after 20260828210000_programs.sql lands and
 * before its follow-up not-null constraint. Never re-fetches: every row's
 * raw.drawName is already in the database, so classifyRound can re-derive the
 * program without touching canada.ca. See ARCHITECTURE.md section 11.
 */
import { z } from 'zod';
import { classifyRound } from './categories.ts';
import type { Json } from './database.types.ts';

export type BackfillRow = { round_number: string; raw: Json };

export type BackfillPlan = {
  updates: { round_number: string; program_code: string }[];
  skipped: { round_number: string; reason: string }[];
};

const rawDrawName = z.object({ drawName: z.string() });

/**
 * Pure: takes rows that need a program_code and returns what to write. A row
 * skips rather than throws when its raw payload does not classify as a
 * program - that would mean the row was misclassified before this feature
 * existed, and it needs a human, not a silent write.
 */
export function planProgramCodeBackfill(rows: readonly BackfillRow[]): BackfillPlan {
  const updates: BackfillPlan['updates'] = [];
  const skipped: BackfillPlan['skipped'] = [];

  for (const row of rows) {
    const parsed = rawDrawName.safeParse(row.raw);
    if (!parsed.success) {
      skipped.push({ round_number: row.round_number, reason: 'raw payload has no drawName' });
      continue;
    }
    const classification = classifyRound(parsed.data.drawName);
    if (classification === null || classification.programCode === null) {
      skipped.push({
        round_number: row.round_number,
        reason: `drawName ${JSON.stringify(parsed.data.drawName)} did not classify to a program`,
      });
      continue;
    }
    updates.push({ round_number: row.round_number, program_code: classification.programCode });
  }

  return { updates, skipped };
}
