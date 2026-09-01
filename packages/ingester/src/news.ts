/**
 * Raw newsroom payload -> candidate rows. Pure: no I/O, no clock, no randomness.
 *
 * Everything off the network is untrusted, a .gc.ca domain included, so the
 * shape is proved with zod before anything is read out of it.
 *
 * Every item lands as a draft. IRCC's newsroom carries everything the
 * department does and only a fraction of it concerns Express Entry, so nothing
 * here decides relevance - a human does, in the review console.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export type CandidateNewsItem = {
  external_id: string;
  published_at: string;
  title: string;
  summary: string | null;
  url: string;
  tags: string[];
};

/**
 * Only the four fields the feed actually carries, and `.passthrough()` is
 * deliberately absent: an unexpected field is fine, but a missing one must
 * fail rather than arrive as undefined.
 */
const entrySchema = z.object({
  link: z.string(),
  title: z.string(),
  teaser: z.string().nullish(),
  publishedDate: z.string(),
});

const feedSchema = z.object({
  feed: z.object({
    entry: z.array(z.unknown()),
  }),
});

export type NewsParseOutcome =
  | { ok: true; item: CandidateNewsItem }
  | { ok: false; reason: string };

/**
 * The id the legacy rows already use.
 *
 * Verified against the live table on 2026-08-31: `external_id` is exactly
 * sha256 of the item's URL. Deriving it the same way is what makes a re-ingest
 * recognise the 100 rows harvested by the earlier attempt instead of
 * duplicating all of them. news.test.ts pins this against a known id, because
 * a change here would look like nothing and quietly double the table.
 */
export function externalIdFor(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

/**
 * The feed publishes local Ottawa times with an offset, e.g.
 * "2026-07-29T13:20:00-04:00". Store UTC, as everything else here does.
 */
function toUtcIso(published: string): string | null {
  const date = new Date(published);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseEntry(raw: unknown): NewsParseOutcome {
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'entry did not match the expected shape' };

  const { link, title, teaser, publishedDate } = parsed.data;
  if (link.trim() === '' || title.trim() === '') {
    return { ok: false, reason: 'entry had no link or no title' };
  }

  const publishedAt = toUtcIso(publishedDate);
  if (publishedAt === null) {
    return { ok: false, reason: `unparseable publishedDate ${JSON.stringify(publishedDate)}` };
  }

  return {
    ok: true,
    item: {
      external_id: externalIdFor(link),
      published_at: publishedAt,
      title: title.trim(),
      // An empty teaser is stored as null rather than "", so "no summary" is
      // one state instead of two.
      summary: teaser === null || teaser === undefined || teaser.trim() === '' ? null : teaser.trim(),
      url: link,
      // Tagging is the reviewer's job. The ingester never guesses relevance.
      tags: [],
    },
  };
}

/**
 * Parse the whole payload.
 *
 * Throws when the envelope itself is wrong - that is schema drift and a human
 * needs to look. Individual entries that fail come back as outcomes so one bad
 * item cannot cost the run seven good ones, matching parse.ts.
 */
export function parseNewsFeed(body: string): NewsParseOutcome[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error('news payload was not valid JSON');
  }

  const feed = feedSchema.safeParse(json);
  if (!feed.success) throw new Error('news payload did not contain feed.entry');

  return feed.data.feed.entry.map(parseEntry);
}

/** The successful items, in the order the feed gave them. */
export function itemsFrom(outcomes: readonly NewsParseOutcome[]): CandidateNewsItem[] {
  return outcomes.flatMap((outcome) => (outcome.ok ? [outcome.item] : []));
}
