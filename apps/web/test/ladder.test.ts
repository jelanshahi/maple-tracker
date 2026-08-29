import { describe, expect, it } from 'vitest';
import { buildLadder, streamKey } from '../src/ladder.ts';
import type { Category, DrawRound } from '../src/rows.ts';

function round(overrides: Partial<DrawRound> & Pick<DrawRound, 'round_number' | 'drawn_at'>): DrawRound {
  return {
    round_type: 'category',
    category_code: 'french',
    cutoff_crs: 400,
    invitations: 5000,
    tie_break_at: null,
    source_url: 'https://www.canada.ca/example',
    ...overrides,
  };
}

const categories: Category[] = [
  { code: 'french', label: 'French-language proficiency' },
  { code: 'trades', label: 'Trades occupations' },
];

describe('streamKey', () => {
  it('uses the category when a round has one', () => {
    expect(streamKey(round({ round_number: '1', drawn_at: '2026-01-01T00:00:00Z' }))).toBe('french');
  });

  it('falls back to the round type, which is how program and general rounds are kept', () => {
    const programRound = round({
      round_number: '2',
      drawn_at: '2026-01-01T00:00:00Z',
      round_type: 'program',
      category_code: null,
    });
    expect(streamKey(programRound)).toBe('program');
  });
});

describe('buildLadder', () => {
  it('keeps uncategorised rounds instead of dropping them', () => {
    // The bug this guards: keying only on category_code silently hid 186
    // program rounds and 178 general rounds, the two largest groups there are.
    const ladder = buildLadder(
      [
        round({ round_number: '437', drawn_at: '2026-08-19T12:35:37Z' }),
        round({
          round_number: '436',
          drawn_at: '2026-08-18T10:13:44Z',
          round_type: 'program',
          category_code: null,
          cutoff_crs: 523,
        }),
      ],
      categories,
    );
    expect(ladder.map((entry) => entry.key)).toStrictEqual(['french', 'program']);
    expect(ladder[1]?.label).toBe('Program-specific');
  });

  it('computes movement against the previous round of the same stream', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '437', drawn_at: '2026-08-19T12:35:37Z', cutoff_crs: 382 }),
        round({ round_number: '433', drawn_at: '2026-08-06T11:29:10Z', cutoff_crs: 391 }),
      ],
      categories,
    );
    expect(ladder[0]?.change).toBe(-9);
    expect(ladder[0]?.previous?.round_number).toBe('433');
    expect(ladder[0]?.roundCount).toBe(2);
  });

  it('reports no movement for a stream with a single round', () => {
    const ladder = buildLadder([round({ round_number: '1', drawn_at: '2026-07-23T10:19:47Z' })], categories);
    expect(ladder[0]?.change).toBeNull();
    expect(ladder[0]?.previous).toBeNull();
  });

  it('sorts unsorted input rather than trusting the caller', () => {
    const ladder = buildLadder(
      [
        round({ round_number: 'old', drawn_at: '2025-01-01T00:00:00Z', cutoff_crs: 500 }),
        round({ round_number: 'new', drawn_at: '2026-08-19T12:35:37Z', cutoff_crs: 382 }),
        round({ round_number: 'mid', drawn_at: '2026-01-01T00:00:00Z', cutoff_crs: 450 }),
      ],
      categories,
    );
    expect(ladder[0]?.latest.round_number).toBe('new');
    expect(ladder[0]?.previous?.round_number).toBe('mid');
  });

  it('orders streams by their most recent round', () => {
    const ladder = buildLadder(
      [
        round({ round_number: 'a', drawn_at: '2024-02-16T15:18:05Z', category_code: 'trades' }),
        round({ round_number: 'b', drawn_at: '2026-08-19T12:35:37Z', category_code: 'french' }),
      ],
      categories,
    );
    expect(ladder.map((entry) => entry.key)).toStrictEqual(['french', 'trades']);
  });

  it('renders an unseeded category code as itself rather than inventing a label', () => {
    const ladder = buildLadder(
      [round({ round_number: '1', drawn_at: '2026-08-19T12:35:37Z', category_code: 'brand-new-stream' })],
      categories,
    );
    expect(ladder[0]?.label).toBe('brand-new-stream');
  });

  it('returns nothing for no rounds', () => {
    expect(buildLadder([], categories)).toStrictEqual([]);
  });

  it('does not confuse 91a and 91b, which parseInt would collapse', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '91a', drawn_at: '2019-02-20T00:00:00Z', cutoff_crs: 457 }),
        round({ round_number: '91b', drawn_at: '2019-02-20T01:00:00Z', cutoff_crs: 332 }),
      ],
      categories,
    );
    expect(ladder[0]?.roundCount).toBe(2);
    expect(ladder[0]?.latest.round_number).toBe('91b');
  });
});

describe('movement across mixed programs', () => {
  // Round 435 was a Provincial Nominee Program draw at 760 and round 436 a
  // Canadian Experience Class draw at 523, both stored as round_type 'program'.
  // Differencing them produced a headline "-237" that described nothing: a
  // nomination is worth 600 points on its own, so the two are different scales.
  const programRounds: DrawRound[] = [
    round({
      round_number: '436',
      drawn_at: '2026-08-18T10:13:44Z',
      round_type: 'program',
      category_code: null,
      cutoff_crs: 523,
    }),
    round({
      round_number: '435',
      drawn_at: '2026-08-17T12:33:42Z',
      round_type: 'program',
      category_code: null,
      cutoff_crs: 760,
    }),
  ];

  it('withholds movement for the program stream rather than printing a wrong number', () => {
    const entry = buildLadder(programRounds, categories)[0];
    expect(entry?.comparable).toBe(false);
    expect(entry?.change).toBeNull();
  });

  it('still reports the stream, its latest cut-off and its history', () => {
    // Withholding the comparison must not cost the 186 rounds behind it.
    const entry = buildLadder(programRounds, categories)[0];
    expect(entry?.latest.cutoff_crs).toBe(523);
    expect(entry?.roundCount).toBe(2);
    expect(entry?.previous?.round_number).toBe('435');
  });

  it('keeps computing movement for streams that are like for like', () => {
    const entry = buildLadder(
      [
        round({ round_number: '437', drawn_at: '2026-08-19T12:35:37Z', cutoff_crs: 382 }),
        round({ round_number: '433', drawn_at: '2026-08-06T11:29:10Z', cutoff_crs: 391 }),
      ],
      categories,
    )[0];
    expect(entry?.comparable).toBe(true);
    expect(entry?.change).toBe(-9);
  });
});
