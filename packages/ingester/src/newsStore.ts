/**
 * News writes. Reuses the service-role client from store.ts, so that key still
 * lives behind exactly one module.
 *
 * Insert-only, and that is the load-bearing decision in this file. See
 * insertNewItems.
 */

import type { CandidateNewsItem } from './news.ts';
import type { Store } from './store.ts';

/**
 * Insert only the items this table has never seen.
 *
 * `ignoreDuplicates` makes this `on conflict (external_id) do nothing`, which
 * matters far more than it looks. An upsert would refresh a title or teaser
 * that IRCC edited - and would also reset the row, resurrecting an item a
 * reviewer already rejected, on every single run. A rejected item has to stay
 * rejected without anyone having to reject it twice.
 *
 * The cost is that an upstream correction never lands. That is the right trade
 * for a queue whose whole purpose is a human decision recorded against a row.
 *
 * Returns how many rows were actually new. Supabase reports the inserted rows
 * back, so this is a count rather than an inference.
 */
export async function insertNewItems(store: Store, items: readonly CandidateNewsItem[]): Promise<number> {
  if (items.length === 0) return 0;

  const { data, error } = await store
    .from('news_items')
    .upsert([...items], { onConflict: 'external_id', ignoreDuplicates: true })
    .select('id');

  if (error !== null) throw new Error(`insert news items: ${error.message}`);
  return data?.length ?? 0;
}
