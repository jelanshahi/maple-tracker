/**
 * The tags a reviewer may apply. A fixed vocabulary, not free text.
 *
 * Free-text tags on a review queue become forty spellings of the same idea
 * within a month, and then the public page cannot filter on any of them. The
 * four below are the ones the legacy rows already use, so nothing already
 * tagged becomes unrecognisable.
 *
 * Pure - no React, no I/O.
 */

export const NEWS_TAGS = ['express-entry', 'pnp', 'policy', 'study-permit'] as const;

export type NewsTag = (typeof NEWS_TAGS)[number];

export const TAG_LABELS: Record<NewsTag, string> = {
  'express-entry': 'Express Entry',
  pnp: 'Provincial Nominee Program',
  policy: 'Policy',
  'study-permit': 'Study permits',
};

/**
 * Keep only tags this app recognises, in the vocabulary's own order.
 *
 * Applied on the way in and on the way out. A row could carry anything - the
 * column is text[] and the legacy rows were written by an earlier tool - and an
 * unknown tag must not reach a page that has no label for it.
 */
export function knownTags(tags: readonly string[]): NewsTag[] {
  return NEWS_TAGS.filter((tag) => tags.includes(tag));
}
