import { describe, expect, it } from 'vitest';
import { NEWS_TAGS, TAG_LABELS, knownTags } from '../src/tags.ts';

describe('the tag vocabulary', () => {
  it('names every tag it defines', () => {
    expect(Object.keys(TAG_LABELS).sort()).toStrictEqual([...NEWS_TAGS].sort());
  });

  it('has no blank label, which would render as an empty chip', () => {
    expect(Object.values(TAG_LABELS).filter((label) => label.trim() === '')).toStrictEqual([]);
  });
});

describe('knownTags', () => {
  it('keeps the tags this app recognises', () => {
    expect(knownTags(['express-entry', 'policy'])).toStrictEqual(['express-entry', 'policy']);
  });

  /**
   * The column is text[] and the legacy rows were written by an earlier tool,
   * so a row can carry anything. An unrecognised tag must not reach a page that
   * has no label for it.
   */
  it('drops a tag it has no label for', () => {
    expect(knownTags(['express-entry', 'made-up-category'])).toStrictEqual(['express-entry']);
  });

  it('returns the vocabulary’s own order, not the row’s', () => {
    // Two rows tagged the same way must render their chips identically.
    expect(knownTags(['policy', 'express-entry'])).toStrictEqual(['express-entry', 'policy']);
  });

  it('handles an untagged row', () => {
    expect(knownTags([])).toStrictEqual([]);
  });
});
