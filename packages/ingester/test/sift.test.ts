import { describe, expect, it } from 'vitest';
import { sift } from '../src/run.ts';
import type { CandidateRound } from '../src/parse.ts';

const round = (over: Partial<CandidateRound> = {}): CandidateRound => ({
  round_number: '437',
  drawn_at: '2026-08-19T12:35:37.000Z',
  round_type: 'category',
  category_code: 'french',
  cutoff_crs: 382,
  invitations: 5000,
  tie_break_at: null,
  source_url: 'https://www.canada.ca/x',
  raw: {},
  ...over,
});

const noExisting = new Map<string, { cutoff_crs: number; invitations: number; drawn_at: string }>();

describe('sift', () => {
  it('keeps every good row when nothing is wrong', () => {
    const { good, bad } = sift([round(), round({ round_number: '436' })], noExisting);
    expect(good).toHaveLength(2);
    expect(bad).toEqual([]);
  });

  // The rule that matters most: one unmappable row must not cost the run its
  // good rounds.
  it('quarantines a bad row without dropping the good ones beside it', () => {
    const { good, bad } = sift([
      round({ round_number: '1', cutoff_crs: 9999 }),
      round({ round_number: '2' }),
      round({ round_number: '3' }),
    ], noExisting);

    expect(good.map((r) => r.round_number)).toEqual(['2', '3']);
    expect(bad).toHaveLength(1);
    expect(bad[0]?.reason).toMatch(/cutoff_crs/);
  });

  it('quarantines a published round that changed, rather than overwriting history', () => {
    const existing = new Map([
      ['437', { cutoff_crs: 382, invitations: 5000, drawn_at: '2026-08-19T12:35:37.000Z' }],
    ]);
    const { good, bad } = sift([round({ cutoff_crs: 400 }), round({ round_number: '436' })], existing);

    expect(good.map((r) => r.round_number)).toEqual(['436']);
    expect(bad[0]?.reason).toMatch(/changed after publication/);
  });

  it('lets an unchanged published round through untouched', () => {
    const existing = new Map([
      ['437', { cutoff_crs: 382, invitations: 5000, drawn_at: '2026-08-19T12:35:37.000Z' }],
    ]);
    expect(sift([round()], existing).good).toHaveLength(1);
  });
});
