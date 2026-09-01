/**
 * The news row shapes this app reads, and the validators that prove them.
 *
 * Same reasoning as rows.ts: the database is trusted, but its shape can drift
 * under the app during a migration, and that should fail loudly rather than
 * render `undefined` onto a page.
 */
import { z } from 'zod';

export const newsStatuses = ['draft', 'published', 'rejected'] as const;
export type NewsStatus = (typeof newsStatuses)[number];

/**
 * Columns are listed explicitly here and in newsQueries.ts. `tags` arrives as
 * whatever text[] the row holds - the legacy rows were written by an earlier
 * tool - so it is validated as strings here and narrowed to the known
 * vocabulary at the point of rendering, by knownTags in tags.ts.
 */
export const newsItemSchema = z.object({
  id: z.number().int(),
  published_at: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  url: z.string(),
  tags: z.array(z.string()),
  status: z.enum(newsStatuses),
});

export type NewsItem = z.infer<typeof newsItemSchema>;
