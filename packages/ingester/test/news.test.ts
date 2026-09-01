import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { externalIdFor, itemsFrom, parseNewsFeed } from '../src/news.ts';

/** A real payload, recorded 2026-08-31. No test in this project makes a network call. */
const sample = readFileSync(fileURLToPath(new URL('./fixtures/news-sample.json', import.meta.url)), 'utf8');

const feedOf = (entries: unknown[]): string => JSON.stringify({ feed: { entry: entries } });

const entry = (over: Record<string, unknown> = {}) => ({
  link: 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/07/example.html',
  title: 'An example announcement',
  teaser: 'Something the department did.',
  publishedDate: '2026-07-29T13:20:00-04:00',
  ...over,
});

describe('externalIdFor', () => {
  /**
   * The 100 rows already in news_items were harvested by an earlier attempt,
   * and their external_id is sha256 of the URL - verified against the live
   * table on 2026-08-31. Deriving it the same way is what makes a re-ingest
   * recognise those rows instead of duplicating every one of them.
   *
   * This is pinned to a real legacy id on purpose. A change to the derivation
   * would look like nothing, break no other test, and quietly double the table.
   */
  it('reproduces the id a legacy row already carries', () => {
    const url = 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/07/'
      + 'minister-metlege-diab-highlights-canada-child-benefit-payments-increasing-in-20262027.html';
    expect(externalIdFor(url)).toBe('6d7ffa2fed1c71b58bf296ee52e962ab265f54bf8c55cd1315025bd8acc9f89c');
  });

  it('gives different URLs different ids', () => {
    expect(externalIdFor('https://a.example/1')).not.toBe(externalIdFor('https://a.example/2'));
  });
});

describe('parseNewsFeed against the recorded payload', () => {
  const outcomes = parseNewsFeed(sample);
  const items = itemsFrom(outcomes);

  it('reads every entry the feed carried', () => {
    expect(outcomes.length).toBe(8);
    expect(items.length).toBe(8);
  });

  it('stores the published time as UTC', () => {
    // The feed publishes Ottawa local time with an offset.
    for (const item of items) expect(item.published_at).toMatch(/Z$/);
  });

  it('keeps IRCC’s own title and link', () => {
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url).toMatch(/^https:\/\/www\.canada\.ca\//);
    }
  });

  it('tags nothing, because relevance is the reviewer’s call', () => {
    for (const item of items) expect(item.tags).toStrictEqual([]);
  });
});

describe('parseNewsFeed entry handling', () => {
  it('converts an offset time to the same instant in UTC', () => {
    const [outcome] = parseNewsFeed(feedOf([entry({ publishedDate: '2026-07-29T13:20:00-04:00' })]));
    expect(outcome?.ok === true && outcome.item.published_at).toBe('2026-07-29T17:20:00.000Z');
  });

  it('stores a missing teaser as null rather than an empty string', () => {
    const [blank] = parseNewsFeed(feedOf([entry({ teaser: '   ' })]));
    const [absent] = parseNewsFeed(feedOf([entry({ teaser: null })]));
    expect(blank?.ok === true && blank.item.summary).toBeNull();
    expect(absent?.ok === true && absent.item.summary).toBeNull();
  });

  it('rejects an entry with no title rather than inventing one', () => {
    const [outcome] = parseNewsFeed(feedOf([entry({ title: '  ' })]));
    expect(outcome?.ok).toBe(false);
  });

  it('rejects an unparseable date rather than storing the epoch', () => {
    const [outcome] = parseNewsFeed(feedOf([entry({ publishedDate: 'last Tuesday' })]));
    expect(outcome?.ok).toBe(false);
  });

  it('rejects one bad entry without losing the good ones beside it', () => {
    const outcomes = parseNewsFeed(feedOf([entry(), entry({ link: 42 }), entry({ link: 'https://x.example/3' })]));
    expect(outcomes.map((o) => o.ok)).toStrictEqual([true, false, true]);
    expect(itemsFrom(outcomes).length).toBe(2);
  });
});

describe('parseNewsFeed on drift', () => {
  it('throws when the payload is not JSON', () => {
    expect(() => parseNewsFeed('<rss><channel/></rss>')).toThrow(/not valid JSON/);
  });

  it('throws when the envelope is not the shape we know', () => {
    expect(() => parseNewsFeed(JSON.stringify({ items: [] }))).toThrow(/feed\.entry/);
  });
});
