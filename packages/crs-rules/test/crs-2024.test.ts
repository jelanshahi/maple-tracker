/**
 * The acceptance test for rules-as-data.
 *
 * crs-2024 was added as one rule-set file and nothing else: score.ts, tables.ts
 * and inputs.ts are untouched by the commit that introduces it. If it had
 * needed a code change, the interpreter would have failed at the one thing it
 * exists for, and the right response would have been to say so rather than to
 * patch around it.
 */

import { describe, expect, it } from 'vitest';
import { score } from '../src/score.ts';
import { crsCurrent } from '../src/rulesets/crs-current.ts';
import { crs2024 } from '../src/rulesets/crs-2024.ts';
import type { RuleSet } from '../src/ruleset.ts';
import type { Profile } from '../src/types.ts';
import { clb, complete } from './fixtures.ts';

/** Section D of the archived grid. A candidate is awarded one row, never both. */
const arrangedEmployment: ReadonlyArray<{ tier: NonNullable<Profile['jobOfferTier']>; delta: number }> = [
  { tier: 'noc-00', delta: 200 },
  { tier: 'noc-0-a-b', delta: 50 },
  { tier: 'none', delta: 0 },
];

/**
 * A profile exercising every factor at once, so "identical apart from arranged
 * employment" is a claim about the whole grid rather than about the three or
 * four factors a simpler profile happens to touch.
 */
const busy: Profile = complete({
  hasAccompanyingSpouse: true,
  age: 34,
  educationLevel: 'masters-or-professional',
  english: { reading: 9, writing: 8, listening: 10, speaking: 7 },
  french: clb(7),
  canadianWorkYears: 2,
  foreignWorkYears: 3,
  hasCertificateOfQualification: true,
  siblingInCanada: true,
  canadianEducationCredential: 'one-or-two-years',
  jobOfferTier: 'noc-00',
  spouse: { educationLevel: 'bachelors-or-three-year', english: clb(8), french: null, firstOfficialLanguage: 'english', canadianWorkYears: 1 },
});

describe('crs-2024 against crs-current', () => {
  it.each(arrangedEmployment)('a $tier job offer is worth exactly $delta more under crs-2024', ({ tier, delta }) => {
    const profile = complete({ jobOfferTier: tier });
    expect(score(profile, crs2024).total - score(profile, crsCurrent).total).toBe(delta);
  });

  it('scores every other factor identically', () => {
    const legacy = score(busy, crs2024).factors.filter((factor) => factor.key !== 'arrangedEmployment');
    expect(legacy).toEqual(score(busy, crsCurrent).factors);
  });

  /**
   * Stronger than comparing scores: this catches a mistyped row in a table no
   * fixture happens to land on.
   */
  it('carries an identical grid apart from the arranged-employment rows', () => {
    const grid = (ruleSet: RuleSet) =>
      JSON.stringify(ruleSet.sections, (key, value) => (key === 'arrangedEmployment' ? undefined : value));
    expect(grid(crs2024)).toBe(grid(crsCurrent));
  });

  it('still caps section D at 600 with both a nomination and a job offer', () => {
    const profile = complete({ provincialNomination: true, jobOfferTier: 'noc-00' });
    const additional = score(profile, crs2024).sections.find((section) => section.key === 'additional');
    expect(additional).toMatchObject({ points: 600, cap: 600, capReached: true });
  });

  it('awards nothing for a job offer the profile does not declare', () => {
    const undeclared = complete({ jobOfferTier: null });
    const arranged = score(undeclared, crs2024).factors.find((factor) => factor.key === 'arrangedEmployment');
    expect(arranged?.points).toBe(0);
    expect(score(undeclared, crs2024).warnings.some((w) => w.includes('jobOfferTier'))).toBe(true);
  });
});

describe('crs-2024 metadata', () => {
  it('ends the day before crs-current begins, with no gap and no overlap', () => {
    expect(crs2024.status).toBe('superseded');
    expect(crs2024.effectiveTo).toBe('2025-03-24');
    expect(crsCurrent.effectiveFrom).toBe('2025-03-25');
  });

  // The numbers are gone from the live page, so the citation has to be an
  // archive of IRCC's own page. It must never become a third-party calculator.
  it('cites an archived IRCC page rather than a live or third-party one', () => {
    expect(crs2024.sourceUrl).toContain('web.archive.org');
    expect(crs2024.sourceUrl).toContain('canada.ca/en/immigration-refugees-citizenship');
  });
});
