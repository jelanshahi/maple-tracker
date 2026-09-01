/**
 * The news reads, and the two writes a reviewer makes.
 *
 * Which rows come back is decided by RLS, not by this file. The public read
 * uses the anon client and can only ever see published rows; the queue uses the
 * signed-in client and returns drafts only to an account in `editors`. A bug
 * here cannot widen either - see supabase/migrations/20260901020000_news_review.sql.
 */
import { z } from 'zod';
import type { AuthedClient } from './authClient.ts';
import { newsItemSchema } from './newsRows.ts';
import type { NewsItem } from './newsRows.ts';
import type { ReadClient } from './supabase.ts';
import type { NewsTag } from './tags.ts';

const NEWS_COLUMNS = 'id, published_at, title, summary, url, tags, status';

/** Bounded because PostgREST caps an unbounded select at 1000 rows and says nothing about it. */
const PUBLISHED_LIMIT = 200;
const QUEUE_LIMIT = 500;

function must<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error !== null) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) {
    throw new Error(`${what}: succeeded but returned no data`);
  }
  return result.data;
}

/**
 * Published items, newest first. The `status` filter is belt and braces: the
 * anon policy already restricts this to published rows, so an accidental
 * removal of the filter changes nothing an outsider can see.
 */
export async function fetchPublishedNews(client: ReadClient): Promise<NewsItem[]> {
  const rows = must(
    await client.from('news_items').select(NEWS_COLUMNS)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(PUBLISHED_LIMIT),
    'read published news',
  );
  return z.array(newsItemSchema).parse(rows);
}

/**
 * The review queue: everything nobody has decided on yet, oldest first.
 *
 * Oldest first because this is a queue rather than a feed - the item that has
 * been waiting longest is the one to deal with next, and a newest-first list
 * would bury the backlog it exists to clear.
 *
 * Returns an empty list rather than throwing when the caller is not an editor:
 * RLS simply matches no rows, and the page treats that the same as an empty
 * queue. Whether the caller is an editor is asked separately, by isEditor.
 */
export async function fetchReviewQueue(client: AuthedClient): Promise<NewsItem[]> {
  const rows = must(
    await client.from('news_items').select(NEWS_COLUMNS)
      .eq('status', 'draft')
      .order('published_at', { ascending: true })
      .limit(QUEUE_LIMIT),
    'read review queue',
  );
  return z.array(newsItemSchema).parse(rows);
}

/**
 * Whether this account may review.
 *
 * Asked against the editors table rather than inferred from what the queue
 * returned: an editor with an empty queue and a stranger must not be
 * distinguishable by the size of a list.
 */
export async function isEditor(client: AuthedClient, userId: string): Promise<boolean> {
  const { data, error } = await client.from('editors').select('user_id').eq('user_id', userId).maybeSingle();
  if (error !== null) return false;
  return data !== null;
}

/**
 * Record a decision.
 *
 * The reviewer's own id is written to reviewed_by so the record says who
 * decided, and the update policy requires the caller to be an editor - a
 * non-editor's update matches no rows rather than being refused, which is the
 * same non-answer they get everywhere else.
 */
export async function recordDecision(
  client: AuthedClient,
  itemId: number,
  decision: 'published' | 'rejected',
  reviewerId: string,
  tags: readonly NewsTag[],
): Promise<void> {
  const { error } = await client
    .from('news_items')
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
      tags: [...tags],
    })
    .eq('id', itemId);

  if (error !== null) throw new Error(`record decision: ${error.message}`);
}
