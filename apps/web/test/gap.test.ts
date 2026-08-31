import { describe, expect, it } from 'vitest';
import { NOMINATION_STREAM_KEY, gapsFor, toCutoffMarks } from '../src/gap.ts';
import type { CutoffMark } from '../src/gap.ts';
import { buildLadder } from '../src/ladder.ts';
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

function mark(overrides: Partial<CutoffMark> & Pick<CutoffMark, 'key' | 'cutoffCrs'>): CutoffMark {
  return {
    label: 'A stream',
    roundNumber: '1',
    drawnAt: '2026-01-01T00:00:00Z',
    sourceUrl: 'https://www.canada.ca/example',
    comparable: true,
    ...overrides,
  };
}

const categories: Category[] = [{ code: 'french', label: 'French-language proficiency' }];
const programs: Program[] = [{ code: 'pnp', label: 'Provincial Nominee Program' }];

describe('toCutoffMarks', () => {
  it('projects each ladder entry down to its latest round', () => {
    const ladder = buildLadder(
      [
        round({ round_number: '10', drawn_at: '2026-02-01T00:00:00Z', cutoff_crs: 379 }),
        round({ round_number: '9', drawn_at: '2026-01-01T00:00:00Z', cutoff_crs: 401 }),
      ],
      categories,
      programs,
    );

    expect(toCutoffMarks(ladder)).toStrictEqual([
      {
        key: 'french',
        label: 'French-language proficiency',
        cutoffCrs: 379,
        roundNumber: '10',
        drawnAt: '2026-02-01T00:00:00Z',
        sourceUrl: 'https://www.canada.ca/example',
        comparable: true,
      },
    ]);
  });

  it('carries the ladder’s comparable flag through, rather than deciding again', () => {
    const ladder = buildLadder(
      [
        round({
          round_number: '11',
          drawn_at: '2026-02-01T00:00:00Z',
          round_type: 'program',
          category_code: null,
          program_code: null,
        }),
      ],
      categories,
      programs,
    );

    expect(ladder[0]?.comparable).toBe(false);
    expect(toCutoffMarks(ladder)[0]?.comparable).toBe(false);
  });
});

describe('gapsFor', () => {
  it('reports points above a cut-off as positive and below as negative', () => {
    const gaps = gapsFor(500, [mark({ key: 'a', cutoffCrs: 480 }), mark({ key: 'b', cutoffCrs: 521 })]);

    expect(gaps.map((gap) => [gap.mark.key, gap.difference])).toStrictEqual([
      ['a', 20],
      ['b', -21],
    ]);
  });

  it('reports zero when the score sits exactly on the cut-off', () => {
    expect(gapsFor(480, [mark({ key: 'a', cutoffCrs: 480 })])[0]?.difference).toBe(0);
  });

  it('withholds the difference where the stream is not like for like', () => {
    const gaps = gapsFor(500, [mark({ key: 'program', cutoffCrs: 450, comparable: false })]);

    expect(gaps[0]?.difference).toBeNull();
    // The cut-off itself is still shown - only the comparison is withheld.
    expect(gaps[0]?.mark.cutoffCrs).toBe(450);
  });

  it('orders comparable streams by cut-off ascending, so the difference column reads down', () => {
    const gaps = gapsFor(500, [
      mark({ key: 'high', cutoffCrs: 788 }),
      mark({ key: 'low', cutoffCrs: 379 }),
      mark({ key: 'middle', cutoffCrs: 521 }),
    ]);

    expect(gaps.map((gap) => gap.mark.key)).toStrictEqual(['low', 'middle', 'high']);
  });

  it('sorts streams with no honest comparison last, whatever their cut-off', () => {
    const gaps = gapsFor(500, [
      mark({ key: 'program', cutoffCrs: 100, comparable: false }),
      mark({ key: 'french', cutoffCrs: 700 }),
    ]);

    expect(gaps.map((gap) => gap.mark.key)).toStrictEqual(['french', 'program']);
  });

  it('returns nothing when there are no cut-offs to compare against', () => {
    expect(gapsFor(500, [])).toStrictEqual([]);
  });

  it('names the provincial nomination stream, which the table has to caveat', () => {
    // Those rounds invite only candidates who already hold a nomination, worth
    // 600 points on its own. The key is asserted so a rename cannot silently
    // drop the caveat from the page.
    expect(NOMINATION_STREAM_KEY).toBe('pnp');
    expect(programs.map((program) => program.code)).toContain(NOMINATION_STREAM_KEY);
  });
});
