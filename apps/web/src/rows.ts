/**
 * The row shapes this app reads, and the validators that prove them.
 *
 * These schemas are the source of truth for row types here, deliberately.
 * packages/ingester has a generated database.types.ts, but apps/web must not
 * import from the ingester, and a second generated copy would be one more file
 * to regenerate and one more pair of things that can drift apart. Validating
 * instead means the shape is checked where it actually arrives: a migration
 * that changes a column under the app fails loudly, rather than rendering
 * "undefined" into a page about somebody's immigration prospects.
 *
 * It also keeps the codebase free of `as` casts on query results, which is what
 * the alternative would have cost.
 */
import { profileSchema } from '@maple/crs-rules';
import { z } from 'zod';

export const roundTypes = ['general', 'program', 'category'] as const;

/**
 * Columns are listed explicitly here and in queries.ts, and draw_rounds.raw is
 * deliberately not among them: it holds the entire source payload - the last
 * one was 796 KB - and pulling it into a page render would be absurd.
 */
export const drawRoundSchema = z.object({
  round_number: z.string(),
  drawn_at: z.string(),
  round_type: z.enum(roundTypes),
  category_code: z.string().nullable(),
  program_code: z.string().nullable(),
  cutoff_crs: z.number().int(),
  invitations: z.number().int(),
  tie_break_at: z.string().nullable(),
  source_url: z.string(),
});

export type DrawRound = z.infer<typeof drawRoundSchema>;

/**
 * A user's own past estimate. Personal information, and scoped to its owner by
 * RLS - see supabase/migrations/20260830233000_accounts.sql.
 *
 * Deliberately no profile column: assessments record the total and the rule set
 * that produced it, not a copy of the answers.
 */
export const assessmentSchema = z.object({
  id: z.number().int(),
  total: z.number().int(),
  rule_set_id: z.string(),
  created_at: z.string(),
});

export type Assessment = z.infer<typeof assessmentSchema>;

/**
 * The stored profile, validated on the way out as well as the way in.
 *
 * The jsonb column is whatever was written to it. A crs-rules Profile that has
 * since gained a field, or a row written by an older version of this app, must
 * fail loudly here rather than reach score() half-formed and quietly cost
 * somebody points. profileSchema is crs-rules' own validator, so this cannot
 * drift from what the engine accepts.
 */
export const savedProfileSchema = z.object({
  profile: profileSchema,
  updated_at: z.string(),
});

export type SavedProfile = z.infer<typeof savedProfileSchema>;

export const categorySchema = z.object({
  code: z.string(),
  label: z.string(),
});

export type Category = z.infer<typeof categorySchema>;

export const programSchema = z.object({
  code: z.string(),
  label: z.string(),
});

export type Program = z.infer<typeof programSchema>;
