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
  cutoff_crs: z.number().int(),
  invitations: z.number().int(),
  tie_break_at: z.string().nullable(),
  source_url: z.string(),
});

export type DrawRound = z.infer<typeof drawRoundSchema>;

export const categorySchema = z.object({
  code: z.string(),
  label: z.string(),
});

export type Category = z.infer<typeof categorySchema>;
