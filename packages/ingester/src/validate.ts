/**
 * Schema validation and business guards. Pure - no I/O, no clock.
 *
 * Everything off the network is untrusted, including a .gc.ca domain. The zod
 * schema runs at the boundary and throws on drift rather than coercing: if IRCC
 * changes the shape of the payload a human needs to look, and a run that
 * quietly adapts is how bad data lands in a table people trust.
 */

import { z } from 'zod';
import type { CandidateRound } from './parse.ts';

/**
 * The fields we read. IRCC publishes every value as a string, including the
 * numbers - large ones carry comma separators ("18,133").
 *
 * Unknown keys are stripped by zod here, which is harmless: the untouched
 * original object is what gets stored in `raw`, never this parsed result.
 */
export const rawRoundSchema = z.object({
  drawNumber: z.string(),
  drawDate: z.string(),
  drawDateTime: z.string(),
  drawName: z.string(),
  drawSize: z.string(),
  drawCRS: z.string(),
  drawCutOff: z.string(),
});

export const rawPayloadSchema = z.object({
  rounds: z.array(z.unknown()),
});

export type RawRound = z.infer<typeof rawRoundSchema>;

/** Mirrors the check constraints in the core schema migration. */
const CUTOFF_MIN = 0;
const CUTOFF_MAX = 1200;
const INVITATIONS_MIN = 1;
const INVITATIONS_MAX = 200_000;

/**
 * Guards that a valid-looking row can still fail. Returns a reason string to
 * quarantine under, or null when the row is good.
 *
 * These sit in front of the database's own check constraints rather than
 * instead of them - both exist, so a guard bug cannot corrupt the table.
 */
export function guardCandidate(candidate: CandidateRound): string | null {
  if (candidate.cutoff_crs < CUTOFF_MIN || candidate.cutoff_crs > CUTOFF_MAX) {
    return `cutoff_crs ${candidate.cutoff_crs} outside ${CUTOFF_MIN}..${CUTOFF_MAX}`;
  }
  if (candidate.invitations < INVITATIONS_MIN || candidate.invitations > INVITATIONS_MAX) {
    return `invitations ${candidate.invitations} outside ${INVITATIONS_MIN}..${INVITATIONS_MAX}`;
  }
  if (candidate.round_type === 'category' && candidate.category_code === null) {
    return 'category round with no category code';
  }
  if (candidate.round_type !== 'category' && candidate.category_code !== null) {
    return `${candidate.round_type} round carries a category code`;
  }
  if (candidate.tie_break_at !== null && candidate.tie_break_at > candidate.drawn_at) {
    return 'tie_break_at is after drawn_at';
  }
  return null;
}

export type Mutation = {
  roundNumber: string;
  field: string;
  was: string | number | null;
  now: string | number | null;
};

/**
 * Detect a published round changing under us.
 *
 * A round that already exists should never change its cut-off, size or date.
 * When one does, IRCC has either corrected a mistake or we have a parser bug,
 * and both need a human - so the changed rows are quarantined rather than
 * overwriting history.
 */
export function findMutations(
  candidates: readonly CandidateRound[],
  existing: ReadonlyMap<string, { cutoff_crs: number; invitations: number; drawn_at: string }>,
): Mutation[] {
  const mutations: Mutation[] = [];
  for (const candidate of candidates) {
    const before = existing.get(candidate.round_number);
    if (before === undefined) continue;

    if (before.cutoff_crs !== candidate.cutoff_crs) {
      mutations.push({ roundNumber: candidate.round_number, field: 'cutoff_crs', was: before.cutoff_crs, now: candidate.cutoff_crs });
    }
    if (before.invitations !== candidate.invitations) {
      mutations.push({ roundNumber: candidate.round_number, field: 'invitations', was: before.invitations, now: candidate.invitations });
    }
    if (before.drawn_at !== candidate.drawn_at) {
      mutations.push({ roundNumber: candidate.round_number, field: 'drawn_at', was: before.drawn_at, now: candidate.drawn_at });
    }
  }
  return mutations;
}
