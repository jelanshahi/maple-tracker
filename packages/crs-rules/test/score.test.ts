import { describe, expect, it } from 'vitest';
import { score } from '../src/score.ts';
import { crsCurrent } from '../src/rulesets/crs-current.ts';
import { blank, clb, complete, fixtures } from './fixtures.ts';

describe('score against hand-verified profiles', () => {
  it.each(fixtures)('$name scores $total', ({ profile, total, workings }) => {
    expect(score(profile, crsCurrent).total, workings).toBe(total);
  });
});

describe('section caps', () => {
  const maxed = fixtures[0]?.profile;

  it('caps core at 500 without a spouse and reports capReached', () => {
    if (maxed === undefined) throw new Error('missing fixture');
    const core = score(maxed, crsCurrent).sections.find((s) => s.key === 'core');
    expect(core).toMatchObject({ points: 500, cap: 500, capReached: true });
  });

  it('caps core at 460 with an accompanying spouse', () => {
    const withSpouse = fixtures[1]?.profile;
    if (withSpouse === undefined) throw new Error('missing fixture');
    const result = score(withSpouse, crsCurrent);
    expect(result.sections.find((s) => s.key === 'core')).toMatchObject({ points: 460, capReached: true });
    expect(result.sections.find((s) => s.key === 'spouse')).toMatchObject({ points: 40, capReached: true });
  });

  it('caps skill transferability at 100 overall', () => {
    if (maxed === undefined) throw new Error('missing fixture');
    const skill = score(maxed, crsCurrent).sections.find((s) => s.key === 'skillTransfer');
    expect(skill).toMatchObject({ points: 100, cap: 100, capReached: true });
  });

  // Each pair caps at 50 before the section cap applies, so a candidate who
  // maxes one pair cannot carry the surplus into another.
  it('caps the education pair at 50 on its own', () => {
    const profile = complete({ educationLevel: 'doctoral', english: clb(10), canadianWorkYears: 5 });
    const result = score(profile, crsCurrent);
    const pair = result.factors.filter((f) => f.key.startsWith('education-'));
    expect(pair.reduce((sum, f) => sum + f.points, 0)).toBe(100);
    // 100 of raw grid points, but the pair contributes only its 50 sub-cap.
    expect(result.sections.find((s) => s.key === 'skillTransfer')?.points).toBe(50);
  });

  it('caps additional points at 600', () => {
    if (maxed === undefined) throw new Error('missing fixture');
    const additional = score(maxed, crsCurrent).sections.find((s) => s.key === 'additional');
    expect(additional).toMatchObject({ points: 600, cap: 600, capReached: true });
  });

  it('never exceeds maxTotal', () => {
    if (maxed === undefined) throw new Error('missing fixture');
    expect(score(maxed, crsCurrent).total).toBeLessThanOrEqual(crsCurrent.maxTotal);
  });
});

describe('missing inputs', () => {
  it('scores zero and warns rather than inferring anything', () => {
    const result = score(blank, crsCurrent);
    expect(result.total).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    for (const warning of result.warnings) expect(warning).toMatch(/not supplied/);
  });

  it('warns per missing factor, naming the input', () => {
    const result = score({ ...blank, age: 29 }, crsCurrent);
    expect(result.warnings.some((w) => w.includes('educationLevel'))).toBe(true);
    // Age was supplied, so it must not be warned about. Matched on the factor
    // label rather than a bare substring - "language" contains "age".
    expect(result.warnings.some((w) => w.startsWith('Age:'))).toBe(false);
  });

  it('raises no warnings when a profile is fully specified', () => {
    expect(score(complete({}), crsCurrent).warnings).toEqual([]);
  });

  it('does not infer a first official language', () => {
    const noChoice = complete({ firstOfficialLanguage: null });
    const result = score(noChoice, crsCurrent);
    expect(result.factors.find((f) => f.key === 'firstOfficialLanguage')?.points).toBe(0);
    expect(result.warnings.some((w) => w.includes('firstOfficial'))).toBe(true);
  });
});

describe('determinism', () => {
  it('returns an identical result every time', () => {
    const profile = complete({});
    const first = JSON.stringify(score(profile, crsCurrent));
    for (let run = 0; run < 100; run += 1) {
      expect(JSON.stringify(score(profile, crsCurrent))).toBe(first);
    }
  });

  it('does not mutate the profile it is given', () => {
    const profile = complete({});
    const before = JSON.stringify(profile);
    score(profile, crsCurrent);
    expect(JSON.stringify(profile)).toBe(before);
  });
});

describe('arranged employment', () => {
  // The single most likely correctness failure in the project. A job offer must
  // move nothing at all under the current rules.
  it('awards nothing for a job offer under crs-current', () => {
    const withOffer = score(complete({ jobOfferTier: 'noc-00' }), crsCurrent);
    const without = score(complete({ jobOfferTier: 'none' }), crsCurrent);
    expect(withOffer.total).toBe(without.total);
  });

  it('declares no arranged-employment factor anywhere in the rule set', () => {
    const keys = Object.values(crsCurrent.sections).flatMap((section) =>
      'factors' in section ? Object.keys(section.factors) : []);
    expect(keys.some((key) => /arranged|jobOffer|employment/i.test(key))).toBe(false);
  });
});

describe('rule set integrity', () => {
  it('matches the published section maxima', () => {
    expect(crsCurrent.sections.core.cap).toEqual({ withSpouse: 460, withoutSpouse: 500 });
    expect(crsCurrent.sections.spouse.cap).toBe(40);
    expect(crsCurrent.sections.skillTransfer.cap).toBe(100);
    expect(crsCurrent.sections.skillTransfer.subCaps).toEqual({ education: 50, foreignWork: 50, certificate: 50 });
    expect(crsCurrent.sections.additional.cap).toBe(600);
  });

  it('cites IRCC as its source', () => {
    expect(crsCurrent.sourceUrl).toContain('canada.ca');
    expect(crsCurrent.status).toBe('active');
  });
});
