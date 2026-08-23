import { describe, expect, it } from 'vitest';
import { findMutations, guardCandidate } from '../src/validate.ts';
import type { CandidateRound } from '../src/parse.ts';

const round: CandidateRound = {
  round_number: '437',
  drawn_at: '2026-08-19T12:35:37.000Z',
  round_type: 'category',
  category_code: 'french',
  cutoff_crs: 382,
  invitations: 5000,
  tie_break_at: '2026-03-01T18:34:05.000Z',
  source_url: 'https://www.canada.ca/x',
  raw: {},
};

describe('guardCandidate', () => {
  it('passes a good row', () => {
    expect(guardCandidate(round)).toBeNull();
  });

  // Round 176's real cut-off of 75 must pass; the original floor of 100 rejected it.
  it('accepts a cut-off of 75', () => {
    expect(guardCandidate({ ...round, cutoff_crs: 75, round_type: 'program', category_code: null })).toBeNull();
  });

  it.each([
    [{ cutoff_crs: 1201 }, /cutoff_crs/],
    [{ cutoff_crs: -1 }, /cutoff_crs/],
    [{ invitations: 0 }, /invitations/],
    [{ invitations: 200_001 }, /invitations/],
  ])('rejects %o', (override, expected) => {
    expect(guardCandidate({ ...round, ...override })).toMatch(expected);
  });

  it('rejects a category round with no category', () => {
    expect(guardCandidate({ ...round, category_code: null })).toMatch(/category round with no category/);
  });

  it('rejects a general round carrying a category', () => {
    expect(guardCandidate({ ...round, round_type: 'general' })).toMatch(/carries a category code/);
  });

  it('rejects a tie-break after the draw', () => {
    expect(guardCandidate({ ...round, tie_break_at: '2026-08-20T00:00:00.000Z' })).toMatch(/after drawn_at/);
  });

  // Round 139: IRCC publishes the draw time and the tie-break as the same
  // string, so equal timestamps are legitimate and must not be rejected.
  it('accepts a tie-break equal to the draw time', () => {
    expect(guardCandidate({ ...round, tie_break_at: round.drawn_at })).toBeNull();
  });
});

describe('findMutations', () => {
  const existing = new Map([['437', { cutoff_crs: 382, invitations: 5000, drawn_at: round.drawn_at }]]);

  it('finds nothing when a published round is unchanged', () => {
    expect(findMutations([round], existing)).toEqual([]);
  });

  it('ignores rounds it has never seen', () => {
    expect(findMutations([{ ...round, round_number: '999' }], existing)).toEqual([]);
  });

  it.each([
    ['cutoff_crs', { cutoff_crs: 383 }],
    ['invitations', { invitations: 5001 }],
    ['drawn_at', { drawn_at: '2026-08-19T12:35:38.000Z' }],
  ])('flags a published round whose %s changed', (field, override) => {
    const found = findMutations([{ ...round, ...override }], existing);
    expect(found).toHaveLength(1);
    expect(found[0]?.field).toBe(field);
  });
});

describe('findMutations timestamp formats', () => {
  // Regression. supabase-js returns timestamptz as "2026-08-19 12:35:37+00",
  // not as the ISO string we send. Comparing the two as text made every round
  // look mutated, which quarantined all 438 rows of a live run and wrote none.
  const postgresStyle = new Map([
    ['437', { cutoff_crs: 382, invitations: 5000, drawn_at: '2026-08-19 12:35:37+00' }],
  ]);

  it('treats the Postgres rendering and the ISO string as the same instant', () => {
    expect(findMutations([round], postgresStyle)).toEqual([]);
  });

  it('still catches a genuine change when the formats differ', () => {
    const changed = { ...round, drawn_at: '2026-08-19T12:35:38.000Z' };
    const found = findMutations([changed], postgresStyle);
    expect(found).toHaveLength(1);
    expect(found[0]?.field).toBe('drawn_at');
  });

  it('flags an unparseable timestamp rather than assuming it matches', () => {
    const broken = new Map([['437', { cutoff_crs: 382, invitations: 5000, drawn_at: 'not a date' }]]);
    expect(findMutations([round], broken)).toHaveLength(1);
  });
});
