/**
 * Hand-verified fixture profiles.
 *
 * Each expected total was worked out from IRCC's published tables factor by
 * factor. Where a number here and the engine disagree, one of them is wrong and
 * it is worth finding out which - do not adjust these just to make a test pass.
 *
 * Six of these were wrong on the first pass and the engine was right every
 * time. The recurring trap: skill-transferability thresholds are min-based, so
 * one weak ability drops the whole tier, and the certificate pair uses CLB 5/7
 * where the other two pairs use CLB 7/9.
 *
 * Four were then run through IRCC's own calculator on 23 August 2026 and match
 * to the point, section by section rather than only on the grand total:
 *
 *   single, 29, bachelor, CLB 9        379  core 354, skill 25
 *   uneven abilities                   353  core 340, skill 13
 *   certificate of qualification CLB 5 279  core 254, certificate pair 25
 *   spouse accompanying                373  core 328, spouse 20, skill 25
 *
 * They were picked to cover different machinery rather than to be easy: the
 * per-ability language sum and the min-based tier drop, the CLB 5/7 thresholds
 * that differ from every other pair, and the switch to the with-spouse columns.
 * The calculator also awards nothing for a job offer, which is the check behind
 * crs-current having no arranged-employment factor at all.
 */

import type { Profile } from '../src/types.ts';

export const blank: Profile = {
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

/** The same benchmark across all four abilities. */
export const clb = (level: number) => ({
  reading: level,
  writing: level,
  listening: level,
  speaking: level,
});

/** A fully specified profile, so nothing is missing and no warnings are raised. */
export const complete = (over: Partial<Profile> = {}): Profile => ({
  ...blank,
  age: 29,
  educationLevel: 'bachelors-or-three-year',
  english: clb(9),
  french: clb(0),
  firstOfficialLanguage: 'english',
  canadianWorkYears: 0,
  foreignWorkYears: 0,
  hasCertificateOfQualification: false,
  siblingInCanada: false,
  canadianEducationCredential: 'none',
  provincialNomination: false,
  jobOfferTier: 'none',
  ...over,
});

export type Fixture = {
  name: string;
  profile: Profile;
  total: number;
  /** How the total was arrived at, for anyone auditing a failure. */
  workings: string;
};

export const fixtures: Fixture[] = [
  {
    name: 'theoretical maximum, single',
    profile: complete({
      age: 29,
      educationLevel: 'doctoral',
      english: clb(10),
      french: clb(9),
      canadianWorkYears: 5,
      foreignWorkYears: 3,
      hasCertificateOfQualification: true,
      siblingInCanada: true,
      canadianEducationCredential: 'three-years-or-more',
      provincialNomination: true,
    }),
    total: 1200,
    workings: 'core 110+150+136+24+80 = 500 at cap; skill 150 capped to 100; additional 695 capped to 600',
  },
  {
    name: 'theoretical maximum, spouse accompanying',
    profile: complete({
      hasAccompanyingSpouse: true,
      age: 29,
      educationLevel: 'doctoral',
      english: clb(10),
      french: clb(9),
      canadianWorkYears: 5,
      foreignWorkYears: 3,
      hasCertificateOfQualification: true,
      siblingInCanada: true,
      canadianEducationCredential: 'three-years-or-more',
      provincialNomination: true,
      spouse: { educationLevel: 'doctoral', english: clb(10), french: null, canadianWorkYears: 5 },
    }),
    total: 1200,
    workings: 'core capped 460 + spouse capped 40 + skill 100 + additional 600 = the same 1200',
  },
  {
    name: 'empty profile scores zero and warns',
    profile: blank,
    total: 0,
    workings: 'nothing supplied; every factor scores 0 and raises a warning',
  },
  {
    name: 'oldest and least qualified',
    profile: complete({ age: 50, educationLevel: 'less-than-secondary', english: clb(3) }),
    total: 0,
    workings: 'age 45+ scores 0, education 0, CLB 3 scores 0 per ability, no work, no extras',
  },
  {
    name: 'single, 29, bachelor, CLB 9',
    profile: complete({}),
    total: 379,
    workings: 'core 110+120+124 = 354; skill education pair 25; additional 0',
  },
  {
    name: 'CLB 7 across all four, below the cliff',
    profile: complete({ age: 30, canadianWorkYears: 1, foreignWorkYears: 1, english: clb(7) }),
    total: 385,
    workings: 'core 105+120+68+40 = 333; skill 26 education + 26 foreign work = 52',
  },
  {
    name: 'CLB 9 across all four, the cliff',
    profile: complete({ age: 30, canadianWorkYears: 1, foreignWorkYears: 1, english: clb(9) }),
    total: 465,
    workings: 'core 105+120+124+40 = 389; skill 38 education + 38 foreign work = 76. 80 points for two CLB levels.',
  },
  {
    name: 'uneven abilities score below the flat equivalent',
    profile: complete({ english: { reading: 9, writing: 9, listening: 9, speaking: 7 } }),
    total: 353,
    workings:
      'first language 31+31+31+17 = 110 rather than 124, so core is 340. The lowest ability also '
      + 'drops the skill tier from clb9 to clb7, so the education pair pays 13 not 25.',
  },
  {
    name: 'age 44, the last year that scores',
    profile: complete({ age: 44 }),
    total: 275,
    workings: 'age 6 instead of 110; core 6+120+124 = 250; skill 25',
  },
  {
    name: 'age 45, the first year that does not',
    profile: complete({ age: 45 }),
    total: 269,
    workings: 'age 0; core 0+120+124 = 244; skill 25',
  },
  {
    name: 'age 18 lower boundary',
    profile: complete({ age: 18 }),
    total: 368,
    workings: 'age 99; core 99+120+124 = 343; skill 25',
  },
  {
    name: 'secondary education only',
    profile: complete({ educationLevel: 'secondary' }),
    total: 264,
    workings: 'education 30; core 110+30+124 = 264; the skill education pair pays 0 for a secondary credential',
  },
  {
    name: 'certificate of qualification at CLB 5',
    profile: complete({ english: clb(5), hasCertificateOfQualification: true }),
    total: 279,
    workings:
      'core 110+120+24 = 254, CLB 5 paying 6 per ability. CLB 5 is below the clb7 tier so the '
      + 'education pair pays nothing, but the certificate pair uses CLB 5/7 and pays 25.',
  },
  {
    name: 'certificate of qualification at CLB 7',
    profile: complete({ english: clb(7), hasCertificateOfQualification: true }),
    total: 361,
    workings:
      'core 110+120+68 = 298; skill education pair 13 plus certificate pair 50 = 63. CLB 7 is the '
      + 'top tier for the certificate pair but only the middle tier for the other two.',
  },
  {
    name: 'French bonus 25, no English test',
    profile: complete({ french: clb(7), english: null, firstOfficialLanguage: 'french' }),
    total: 336,
    workings: 'core 110+120+68 = 298; skill education pair 13; French-only bonus 25',
  },
  {
    name: 'French bonus 50, with English at CLB 5',
    profile: complete({ french: clb(7), english: clb(5), firstOfficialLanguage: 'french' }),
    total: 365,
    workings: 'core 302 including 4 for second-language English; skill 13; bonus 50 rather than 25',
  },
  {
    name: 'provincial nomination swamps everything',
    profile: complete({ provincialNomination: true }),
    total: 979,
    workings: '379 plus the 600 nomination',
  },
  {
    name: 'spouse accompanying scores lower than the same person single',
    profile: complete({
      hasAccompanyingSpouse: true,
      spouse: { educationLevel: 'bachelors-or-three-year', english: clb(7), french: null, canadianWorkYears: 0 },
    }),
    total: 373,
    workings:
      'core drops to the with-spouse column: 100+112+116 = 328. Spouse adds 8 for education and 12 '
      + 'for CLB 7 language = 20. Skill education pair 25. Below the same person single, at 379.',
  },
  {
    name: 'married but spouse not accompanying uses the single columns',
    profile: complete({ hasAccompanyingSpouse: false, spouse: null }),
    total: 379,
    workings: 'identical to the single case',
  },
  {
    name: 'five years Canadian work, no foreign experience',
    profile: complete({ canadianWorkYears: 5 }),
    total: 484,
    workings: 'core 110+120+124+80 = 434; skill education pair at its 50 sub-cap',
  },
];
