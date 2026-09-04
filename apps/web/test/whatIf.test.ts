/**
 * The same profile scored again with one answer changed.
 *
 * Two things are being protected here, and only one of them is arithmetic.
 *
 * The arithmetic: every delta must come out of score(), never out of a literal
 * in the source. CLAUDE.md's "never hardcode a points value" rule is what keeps
 * this panel correct when IRCC moves a number, and a test that recomputed the
 * expected delta the same way the code does would prove nothing. So one case is
 * worked out by hand from the published criteria and written down.
 *
 * The wording: this panel sits on the wrong side of IRPA s.91 the moment it
 * recommends anything. The copy tests below are not style checks - they are the
 * legal boundary, asserted.
 */
import { crsCurrent, score } from '@maple/crs-rules';
import type { Profile } from '@maple/crs-rules';
import { describe, expect, it } from 'vitest';
import { NOMINATION_LEVER_KEY, leversFor } from '../src/whatIf.ts';

const clb = (level: number) => ({ reading: level, writing: level, listening: level, speaking: level });

/** English CLB 9, no French, nothing else answered. Well clear of every cap. */
const single: Profile = {
  hasAccompanyingSpouse: false,
  age: 29,
  educationLevel: 'bachelors-or-three-year',
  english: clb(9),
  french: null,
  firstOfficialLanguage: 'english',
  canadianWorkYears: 0,
  foreignWorkYears: 0,
  hasCertificateOfQualification: false,
  siblingInCanada: false,
  canadianEducationCredential: 'none',
  provincialNomination: false,
  jobOfferTier: null,
  spouse: null,
};

/** The profile that already scores the 1200 maximum. Nothing can raise it. */
const maxed: Profile = {
  ...single,
  educationLevel: 'doctoral',
  english: clb(10),
  french: clb(9),
  canadianWorkYears: 5,
  foreignWorkYears: 3,
  hasCertificateOfQualification: true,
  siblingInCanada: true,
  canadianEducationCredential: 'three-years-or-more',
  provincialNomination: true,
};

const withSpouse: Profile = {
  ...single,
  hasAccompanyingSpouse: true,
  spouse: {
    educationLevel: 'secondary',
    english: clb(5),
    french: null,
    firstOfficialLanguage: 'english',
    canadianWorkYears: 0,
  },
};

const blank: Profile = {
  hasAccompanyingSpouse: false,
  age: null,
  educationLevel: null,
  english: null,
  french: null,
  firstOfficialLanguage: null,
  canadianWorkYears: null,
  foreignWorkYears: null,
  hasCertificateOfQualification: null,
  siblingInCanada: null,
  canadianEducationCredential: null,
  provincialNomination: null,
  jobOfferTier: null,
  spouse: null,
};

const totalFor = (profile: Profile) => score(profile, crsCurrent).total;

describe('leversFor arithmetic', () => {
  /**
   * Worked out by hand from IRCC's published criteria, not by rerunning the
   * code. This profile is single, so every pair resolves to its without-spouse
   * column, and it sits far below the 500 core cap so nothing is clipped:
   *
   *   second official language, NCLC 7 -> 3 points per ability, four abilities = 12
   *   French bonus, French CLB 7+ with English CLB 5+ = 50
   *
   * Skill transferability does not move: its foreign-work pairs need a year of
   * foreign work and there is none, and its education pair reads the *first*
   * official language, which has not changed. So 12 + 50 = 62.
   */
  it('gives French at NCLC 7 the delta the published criteria give it', () => {
    const french7 = leversFor(single, crsCurrent).find((lever) => lever.key === 'french-clb-7');
    expect(french7?.delta).toBe(62);
  });

  /** Second official language caps at 24: 6 per ability rather than 3, plus the same 50. */
  it('gives French at NCLC 9 its own hand-worked delta', () => {
    const french9 = leversFor(single, crsCurrent).find((lever) => lever.key === 'french-clb-9');
    expect(french9?.delta).toBe(74);
  });

  it('reports a delta that is exactly the difference between two real scores', () => {
    const baseline = totalFor(single);
    for (const lever of leversFor(single, crsCurrent)) {
      expect(lever.total - baseline).toBe(lever.delta);
    }
  });

  it('respects the caps, because a maxed profile has nothing left to raise', () => {
    expect(leversFor(maxed, crsCurrent)).toStrictEqual([]);
  });

  it('never returns a change that costs points or changes nothing', () => {
    for (const lever of leversFor(single, crsCurrent)) {
      expect(lever.delta).toBeGreaterThan(0);
    }
  });

  it('leaves the profile it was given alone', () => {
    const before = JSON.stringify(single);
    leversFor(single, crsCurrent);
    expect(JSON.stringify(single)).toBe(before);
  });
});

describe('leversFor ordering', () => {
  /**
   * A nomination is worth more than everything else put together, so sorting by
   * size would pin it to the top of every reader's panel for ever. That reads as
   * "go and get a nomination", which is advice, and it misdescribes a separate
   * competitive application to a province as a score adjustment.
   */
  it('puts the nomination last even though it is always the largest', () => {
    const levers = leversFor(single, crsCurrent);
    const nomination = levers.find((lever) => lever.key === NOMINATION_LEVER_KEY);

    expect(nomination).toBeDefined();
    expect(levers.at(-1)?.key).toBe(NOMINATION_LEVER_KEY);
    expect(nomination?.delta).toBe(Math.max(...levers.map((lever) => lever.delta)));
  });

  it('qualifies the nomination row rather than leaving it as a bare number', () => {
    const nomination = leversFor(single, crsCurrent).find((l) => l.key === NOMINATION_LEVER_KEY);
    expect(nomination?.note).toMatch(/separate application/);
  });
});

describe('leversFor and the shape of a profile', () => {
  it('offers spouse changes only when a spouse is actually accompanying', () => {
    expect(leversFor(withSpouse, crsCurrent).some((l) => l.group === 'spouse')).toBe(true);
    expect(leversFor(single, crsCurrent).some((l) => l.group === 'spouse')).toBe(false);
  });

  it('offers no education level at or below the one already held', () => {
    const labels = leversFor(single, crsCurrent).map((lever) => lever.label);
    expect(labels).not.toContain("Bachelor's degree or a three-year credential");
  });

  it('survives a profile with nothing answered', () => {
    const levers = leversFor(blank, crsCurrent);
    for (const lever of levers) expect(lever.total).toBeGreaterThanOrEqual(0);
  });
});

/**
 * The wording is the legal boundary, so it is asserted rather than reviewed.
 * packages/crs-rules/test/explanations.test.ts does the same job for the
 * scoring engine's own explanations.
 */
describe('leversFor says nothing it is not allowed to say', () => {
  const everyString = [single, withSpouse, blank].flatMap((profile) =>
    leversFor(profile, crsCurrent).flatMap((lever) => [lever.label, lever.note ?? '']),
  );

  it('never advises, recommends or promises a result', () => {
    for (const text of everyString) {
      expect(text).not.toMatch(/\b(should|recommend|advise|best|improve|boost|maximis|guarantee)/i);
    }
  });

  it('never claims a change clears a cut-off or makes anybody eligible', () => {
    for (const text of everyString) {
      expect(text).not.toMatch(/\b(cut-off|cutoff|qualify|qualifies|eligible|eligibility|invit)/i);
    }
  });

  it('names no internal input and renders no null', () => {
    for (const text of everyString) {
      expect(text).not.toMatch(/firstOfficial|secondOfficial|WorkYears|skillTransfer|frenchBonus/);
      expect(text).not.toMatch(/\b(null|undefined|NaN)\b/);
    }
  });

  it('gives every row a non-empty label', () => {
    for (const profile of [single, withSpouse, blank]) {
      for (const lever of leversFor(profile, crsCurrent)) {
        expect(lever.label.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
