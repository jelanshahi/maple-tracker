/**
 * Derive the named inputs a rule set reads from a profile. Pure.
 *
 * These are derivations of structure, never of points. Deciding that a master's
 * degree sits in a particular row of IRCC's grid is structural; what that row
 * awards is data in the rule set.
 *
 * Nothing is ever inferred. A field the profile does not supply comes out null,
 * which scores zero for that factor and raises a warning.
 */

import type { LanguageTest, Profile } from './types.ts';

export type Scalar = string | number | boolean | null;

export type DerivedInputs = {
  scalars: Record<string, Scalar>;
  languages: Record<string, LanguageTest | null>;
};

const lowestAbility = (test: LanguageTest | null): number | null =>
  test === null ? null : Math.min(test.reading, test.writing, test.listening, test.speaking);

/**
 * Skill transferability collapses the eight education levels onto three rows.
 *
 * Master's, professional and doctoral credentials sit in the top row: IRCC's
 * education-plus-Canadian-work grid lists them there explicitly at the same
 * award as "two or more credentials", and the education-plus-language grid uses
 * the same three rows.
 */
function skillTransferEducationTier(level: Profile['educationLevel']): Scalar {
  if (level === null) return null;
  switch (level) {
    case 'less-than-secondary':
    case 'secondary':
      return 'secondary-or-less';
    case 'one-year-post-secondary':
    case 'two-year-post-secondary':
    case 'bachelors-or-three-year':
      return 'one-year-plus';
    case 'two-or-more-credentials':
    case 'masters-or-professional':
    case 'doctoral':
      return 'two-or-more-or-advanced';
  }
}

/** Banded because the grids are banded; the band boundaries come from IRCC's rows. */
function band(value: number | null, bands: ReadonlyArray<readonly [number, string]>, below: string): Scalar {
  if (value === null) return null;
  for (const [threshold, name] of bands) {
    if (value >= threshold) return name;
  }
  return below;
}

/**
 * The French bonus keys on two facts at once, which the condition language
 * cannot express, so it is collapsed here into one categorical input. The 25
 * and 50 still come from the rule set.
 */
function frenchBonusCategory(profile: Profile): Scalar {
  const french = lowestAbility(profile.french);
  if (french === null) return null;
  if (french < 7) return 'none';
  const english = lowestAbility(profile.english);
  return english !== null && english >= 5 ? 'french-and-english' : 'french-only';
}

export function deriveInputs(profile: Profile): DerivedInputs {
  const first = profile.firstOfficialLanguage;
  const firstOfficial = first === null ? null : first === 'english' ? profile.english : profile.french;
  const secondOfficial = first === null ? null : first === 'english' ? profile.french : profile.english;
  const spouseFirstOfficial =
    first === null || profile.spouse === null
      ? null
      : first === 'english' ? profile.spouse.english : profile.spouse.french;

  const firstMin = lowestAbility(firstOfficial);

  return {
    languages: { firstOfficial, secondOfficial, spouseFirstOfficial },
    scalars: {
      age: profile.age,
      educationLevel: profile.educationLevel,
      canadianWorkYears: profile.canadianWorkYears,
      foreignWorkYears: profile.foreignWorkYears,
      siblingInCanada: profile.siblingInCanada,
      canadianEducationCredential: profile.canadianEducationCredential,
      provincialNomination: profile.provincialNomination,
      jobOfferTier: profile.jobOfferTier,
      frenchBonusCategory: frenchBonusCategory(profile),

      spouseEducationLevel: profile.spouse?.educationLevel ?? null,
      spouseCanadianWorkYears: profile.spouse?.canadianWorkYears ?? null,

      // Skill transferability rows and columns.
      skillTransferEducationTier: skillTransferEducationTier(profile.educationLevel),
      // The CLB 9 cliff: transferability roughly doubles at 9 across all four.
      firstLanguageTier: band(firstMin, [[9, 'clb9'], [7, 'clb7']], 'none'),
      // The certificate pair uses CLB 5 and 7, not 7 and 9.
      certificateLanguageTier: band(firstMin, [[7, 'clb7'], [5, 'clb5']], 'none'),
      canadianWorkTier: band(profile.canadianWorkYears, [[2, 'two-plus'], [1, 'one']], 'none'),
      foreignWorkTier: band(profile.foreignWorkYears, [[3, 'three-plus'], [1, 'one-to-two']], 'none'),
      certificateTier: profile.hasCertificateOfQualification === null
        ? null
        : profile.hasCertificateOfQualification ? 'has-certificate' : 'none',
    },
  };
}
