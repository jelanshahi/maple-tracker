import { describe, expect, it } from 'vitest';
import { buildLadder, previousInStream, streamKey } from '../src/ladder.ts';
import type { Category, DrawRound, Program } from '../src/rows.ts';

function round(overrides: Partial<DrawRound> & Pick<DrawRound, 'round_number' | 'drawn_at'>): DrawRound {
  return {
    round_type: 'category',
    category_code: 'french',
    program_code: null,
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

const programs: Program[] = [
  { code: 'cec', label: 'Canadian Experience Class' },
  { code: 'pnp', label: 'Provincial Nominee Program' },
];

describe('streamKey', () => {
  it('uses the category when a round has one', () => {
    expect(streamKey(round({ round_number: '1', drawn_at: '2026-01-01T00:00:00Z' }))).toBe('french');
  });

  it('uses the program code when a round has one and no category', () => {
    const programRound = round({
      round_number: '2',
      drawn_at: '2026-01-01T00:00:00Z',
      round_type: 'program',
      category_code: null,
      program_code: 'cec',
    });
    expect(streamKey(programRound)).toBe('cec');
  });

  it('falls back to the round type when neither a category nor a program code is known', () => {
    const programRound = round({
      round_number: '3',
      drawn_at: '2026-01-01T00:00:00Z',
      round_type: 'program',
      category_code: null,
      program_code: null,
    });
    expect(streamKey(programRound)).toBe('program');
  });
});

describe('buildLadder', () => {
  it('keeps uncategorised rounds instead of dropping them', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '437', drawn_at: '2026-08-19T12:35:37Z' }),
        round({
          round_number: '436',
          drawn_at: '2026-08-18T10:13:44Z',
          round_type: 'program',
          category_code: null,
          program_code: null,
          cutoff_crs: 523,
        }),
      ],
      categories,
      [],
    );
    expect(ladder.map((entry) => entry.key)).toStrictEqual(['french', 'program']);
    expect(ladder[1]?.label).toBe('Program-specific (uncategorised)');
  });

  it('computes movement against the previous round of the same stream', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '437', drawn_at: '2026-08-19T12:35:37Z', cutoff_crs: 382 }),
        round({ round_number: '433', drawn_at: '2026-08-06T11:29:10Z', cutoff_crs: 391 }),
      ],
      categories,
      [],
    );
    expect(ladder[0]?.change).toBe(-9);
    expect(ladder[0]?.previous?.round_number).toBe('433');
    expect(ladder[0]?.roundCount).toBe(2);
  });

  it('reports no movement for a stream with a single round', () => {
    const ladder = buildLadder([round({ round_number: '1', drawn_at: '2026-07-23T10:19:47Z' })], categories, []);
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
      [],
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
      [],
    );
    expect(ladder.map((entry) => entry.key)).toStrictEqual(['french', 'trades']);
  });

  it('renders an unseeded category code as itself rather than inventing a label', () => {
    const ladder = buildLadder(
      [round({ round_number: '1', drawn_at: '2026-08-19T12:35:37Z', category_code: 'brand-new-stream' })],
      categories,
      [],
    );
    expect(ladder[0]?.label).toBe('brand-new-stream');
  });

  it('returns nothing for no rounds', () => {
    expect(buildLadder([], categories, [])).toStrictEqual([]);
  });

  it('does not confuse 91a and 91b, which parseInt would collapse', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '91a', drawn_at: '2019-02-20T00:00:00Z', cutoff_crs: 457 }),
        round({ round_number: '91b', drawn_at: '2019-02-20T01:00:00Z', cutoff_crs: 332 }),
      ],
      categories,
      [],
    );
    expect(ladder[0]?.roundCount).toBe(2);
    expect(ladder[0]?.latest.round_number).toBe('91b');
  });
});

describe('program streams split by program code', () => {
  // Round 436 was a Canadian Experience Class draw at 523 and round 435 a
  // Provincial Nominee Program draw at 760 - both round_type 'program', now
  // carrying distinct program_code values. They must land in separate,
  // comparable streams rather than being differenced against each other.
  const rounds: DrawRound[] = [
    round({
      round_number: '436',
      drawn_at: '2026-08-18T10:13:44Z',
      round_type: 'program',
      category_code: null,
      program_code: 'cec',
      cutoff_crs: 523,
    }),
    round({
      round_number: '435',
      drawn_at: '2026-08-17T12:33:42Z',
      round_type: 'program',
      category_code: null,
      program_code: 'pnp',
      cutoff_crs: 760,
    }),
  ];

  it('keeps each program as its own comparable stream', () => {
    const ladder = buildLadder(rounds, categories, programs);
    expect(ladder.map((entry) => entry.key)).toStrictEqual(['cec', 'pnp']);
    expect(ladder.every((entry) => entry.comparable)).toBe(true);
  });

  it('labels each program stream from the programs table', () => {
    const ladder = buildLadder(rounds, categories, programs);
    expect(ladder.find((entry) => entry.key === 'cec')?.label).toBe('Canadian Experience Class');
    expect(ladder.find((entry) => entry.key === 'pnp')?.label).toBe('Provincial Nominee Program');
  });

  it('computes real movement within one program across two of its rounds', () => {
    const ladder = buildLadder(
      [
        ...rounds,
        round({
          round_number: '297',
          drawn_at: '2026-06-01T00:00:00Z',
          round_type: 'program',
          category_code: null,
          program_code: 'cec',
          cutoff_crs: 500,
        }),
      ],
      categories,
      programs,
    );
    const cec = ladder.find((entry) => entry.key === 'cec');
    expect(cec?.change).toBe(23);
    expect(cec?.comparable).toBe(true);
  });
});

describe('program rounds without a program code yet', () => {
  it('falls back to the generic, non-comparable program bucket', () => {
    const rounds: DrawRound[] = [
      round({
        round_number: '1', drawn_at: '2026-08-18T10:13:44Z',
        round_type: 'program', category_code: null, program_code: null, cutoff_crs: 523,
      }),
      round({
        round_number: '2', drawn_at: '2026-08-17T12:33:42Z',
        round_type: 'program', category_code: null, program_code: null, cutoff_crs: 760,
      }),
    ];
    const entry = buildLadder(rounds, categories, [])[0];
    expect(entry?.key).toBe('program');
    expect(entry?.comparable).toBe(false);
    expect(entry?.change).toBeNull();
  });
});

describe('previousInStream', () => {
  // What the round detail page needs: the round this one should be compared
  // against, which is the previous round of the same stream and never simply
  // the previous round overall.
  const rounds: DrawRound[] = [
    round({ round_number: '437', drawn_at: '2026-08-19T12:35:37Z', cutoff_crs: 382 }),
    round({
      round_number: '436', drawn_at: '2026-08-18T10:13:44Z',
      round_type: 'program', category_code: null, program_code: 'cec', cutoff_crs: 523,
    }),
    round({ round_number: '433', drawn_at: '2026-08-06T11:29:10Z', cutoff_crs: 391 }),
    round({
      round_number: '297', drawn_at: '2026-06-01T00:00:00Z',
      round_type: 'program', category_code: null, program_code: 'cec', cutoff_crs: 500,
    }),
  ];

  it('skips over rounds of other streams', () => {
    const target = rounds[0];
    if (target === undefined) throw new Error('fixture');
    // 436 is newer than 433 but belongs to the CEC stream, not french.
    expect(previousInStream(rounds, target)?.round_number).toBe('433');
  });

  it('finds the previous round of a program stream', () => {
    const target = rounds[1];
    if (target === undefined) throw new Error('fixture');
    expect(previousInStream(rounds, target)?.round_number).toBe('297');
  });

  it('returns null for the oldest round of its stream', () => {
    const target = rounds[3];
    if (target === undefined) throw new Error('fixture');
    expect(previousInStream(rounds, target)).toBeNull();
  });

  it('sorts unsorted input rather than trusting the caller', () => {
    const target = rounds[0];
    if (target === undefined) throw new Error('fixture');
    expect(previousInStream([...rounds].reverse(), target)?.round_number).toBe('433');
  });

  it('does not confuse 91a and 91b, which parseInt would collapse', () => {
    const a = round({ round_number: '91a', drawn_at: '2019-02-20T00:00:00Z', cutoff_crs: 457 });
    const b = round({ round_number: '91b', drawn_at: '2019-02-20T01:00:00Z', cutoff_crs: 332 });
    expect(previousInStream([a, b], b)?.round_number).toBe('91a');
    expect(previousInStream([a, b], a)).toBeNull();
  });

  it('ignores a round drawn at the same instant rather than comparing it to itself', () => {
    const first = round({ round_number: 'x', drawn_at: '2026-01-01T00:00:00Z' });
    expect(previousInStream([first], first)).toBeNull();
  });
});
