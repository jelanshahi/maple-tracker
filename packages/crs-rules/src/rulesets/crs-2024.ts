/**
 * CRS as it stood before 25 March 2025, frozen.
 *
 * Identical to the current rule set in every value except section D, which
 * awarded arranged-employment points: 200 for a job offer in NOC TEER 0 major
 * group 00 and 50 for one in TEER 1, 2 or 3 or any other TEER 0. Those two
 * rows are the only difference; every other number was compared line by line
 * against the archived page and matched.
 *
 * The live IRCC criteria page no longer carries these numbers, so sourceUrl
 * cites an Internet Archive capture of IRCC's own page rather than a live URL.
 * That is a deliberate exception to the live-source rule and the only honest
 * one available: the alternative is a third-party calculator, and those are
 * exactly what the rule against them exists to keep out.
 *
 * Deliberately a full copy rather than a spread of the current rule set. A
 * superseded rule set is a historical record and must not move when the
 * current one is corrected. The two files diffing cleanly is the point, not a
 * smell.
 *
 * effectiveFrom is the archived page's own "Date modified", the latest date on
 * which IRCC states these values were current. Anyone needing an earlier
 * boundary should add a further rule set rather than widen this one.
 */

import { parseRuleSet } from '../ruleset.ts';
import type { RuleSet } from '../ruleset.ts';

/** Internet Archive capture of IRCC's grid page, taken 13 December 2024. */
const SOURCE_URL =
  'https://web.archive.org/web/20241213161303/https://www.canada.ca/en/immigration-refugees-citizenship'
  + '/services/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system/grid.html';

/** Points pairs read "with spouse / without spouse", matching IRCC's two columns. */
const pair = (withSpouse: number, withoutSpouse: number) => ({ withSpouse, withoutSpouse });
const exactly = (value: number) => ({ kind: 'range' as const, min: value, max: value });
const atLeast = (min: number) => ({ kind: 'range' as const, min });
const atMost = (max: number) => ({ kind: 'range' as const, max });
const between = (min: number, max: number) => ({ kind: 'range' as const, min, max });
const is = (value: string) => ({ kind: 'eq' as const, value });
const present = { kind: 'present' as const };

export const crs2024: RuleSet = parseRuleSet({
  id: 'crs-2024',
  label: 'Comprehensive Ranking System (before 25 March 2025)',
  effectiveFrom: '2024-06-13',
  effectiveTo: '2025-03-24',
  status: 'superseded',
  sourceUrl: SOURCE_URL,
  maxTotal: 1200,
  sections: {
    // 110 + 150 + 136 + 24 + 80 = 500, or 100 + 140 + 128 + 22 + 70 = 460.
    core: {
      label: 'Core / human capital',
      cap: pair(460, 500),
      factors: {
        age: {
          label: 'Age',
          input: 'age',
          mode: 'lookup',
          cap: pair(100, 110),
          entries: [
            { when: atMost(17), points: pair(0, 0) },
            { when: exactly(18), points: pair(90, 99) },
            { when: exactly(19), points: pair(95, 105) },
            { when: between(20, 29), points: pair(100, 110) },
            { when: exactly(30), points: pair(95, 105) },
            { when: exactly(31), points: pair(90, 99) },
            { when: exactly(32), points: pair(85, 94) },
            { when: exactly(33), points: pair(80, 88) },
            { when: exactly(34), points: pair(75, 83) },
            { when: exactly(35), points: pair(70, 77) },
            { when: exactly(36), points: pair(65, 72) },
            { when: exactly(37), points: pair(60, 66) },
            { when: exactly(38), points: pair(55, 61) },
            { when: exactly(39), points: pair(50, 55) },
            { when: exactly(40), points: pair(45, 50) },
            { when: exactly(41), points: pair(35, 39) },
            { when: exactly(42), points: pair(25, 28) },
            { when: exactly(43), points: pair(15, 17) },
            { when: exactly(44), points: pair(5, 6) },
            { when: atLeast(45), points: pair(0, 0) },
          ],
        },
        education: {
          label: 'Level of education',
          input: 'educationLevel',
          mode: 'lookup',
          cap: pair(140, 150),
          entries: [
            { when: is('less-than-secondary'), points: pair(0, 0) },
            { when: is('secondary'), points: pair(28, 30) },
            { when: is('one-year-post-secondary'), points: pair(84, 90) },
            { when: is('two-year-post-secondary'), points: pair(91, 98) },
            { when: is('bachelors-or-three-year'), points: pair(112, 120) },
            { when: is('two-or-more-credentials'), points: pair(119, 128) },
            { when: is('masters-or-professional'), points: pair(126, 135) },
            { when: is('doctoral'), points: pair(140, 150) },
          ],
        },
        firstOfficialLanguage: {
          label: 'First official language',
          input: 'firstOfficial',
          mode: 'perAbility',
          cap: pair(128, 136),
          entries: [
            { when: atMost(3), points: pair(0, 0) },
            { when: between(4, 5), points: pair(6, 6) },
            { when: exactly(6), points: pair(8, 9) },
            { when: exactly(7), points: pair(16, 17) },
            { when: exactly(8), points: pair(22, 23) },
            { when: exactly(9), points: pair(29, 31) },
            { when: atLeast(10), points: pair(32, 34) },
          ],
        },
        secondOfficialLanguage: {
          label: 'Second official language',
          input: 'secondOfficial',
          mode: 'perAbility',
          cap: pair(22, 24),
          entries: [
            { when: atMost(4), points: pair(0, 0) },
            { when: between(5, 6), points: pair(1, 1) },
            { when: between(7, 8), points: pair(3, 3) },
            { when: atLeast(9), points: pair(6, 6) },
          ],
        },
        canadianWorkExperience: {
          label: 'Canadian work experience',
          input: 'canadianWorkYears',
          mode: 'lookup',
          cap: pair(70, 80),
          entries: [
            { when: atMost(0), points: pair(0, 0) },
            { when: exactly(1), points: pair(35, 40) },
            { when: exactly(2), points: pair(46, 53) },
            { when: exactly(3), points: pair(56, 64) },
            { when: exactly(4), points: pair(63, 72) },
            { when: atLeast(5), points: pair(70, 80) },
          ],
        },
      },
    },

    // 10 + 20 + 10 = 40.
    spouse: {
      label: 'Spouse or common-law partner',
      cap: 40,
      factors: {
        spouseEducation: {
          label: 'Level of education (spouse)',
          input: 'spouseEducationLevel',
          mode: 'lookup',
          cap: 10,
          entries: [
            { when: is('less-than-secondary'), points: 0 },
            { when: is('secondary'), points: 2 },
            { when: is('one-year-post-secondary'), points: 6 },
            { when: is('two-year-post-secondary'), points: 7 },
            { when: is('bachelors-or-three-year'), points: 8 },
            { when: is('two-or-more-credentials'), points: 9 },
            { when: is('masters-or-professional'), points: 10 },
            { when: is('doctoral'), points: 10 },
          ],
        },
        spouseLanguage: {
          label: 'Official language proficiency (spouse)',
          input: 'spouseFirstOfficial',
          mode: 'perAbility',
          cap: 20,
          entries: [
            { when: atMost(4), points: 0 },
            { when: between(5, 6), points: 1 },
            { when: between(7, 8), points: 3 },
            { when: atLeast(9), points: 5 },
          ],
        },
        spouseCanadianWorkExperience: {
          label: 'Canadian work experience (spouse)',
          input: 'spouseCanadianWorkYears',
          mode: 'lookup',
          cap: 10,
          entries: [
            { when: atMost(0), points: 0 },
            { when: exactly(1), points: 5 },
            { when: exactly(2), points: 7 },
            { when: exactly(3), points: 8 },
            { when: exactly(4), points: 9 },
            { when: atLeast(5), points: 10 },
          ],
        },
      },
    },

    // Three pairs of 50, capped at 100 overall.
    skillTransfer: {
      label: 'Skill transferability',
      cap: 100,
      subCaps: { education: 50, foreignWork: 50, certificate: 50 },
      combinations: [
        {
          key: 'education-language',
          label: 'Education with official language proficiency',
          subCap: 'education',
          rowInput: 'skillTransferEducationTier',
          columnInput: 'firstLanguageTier',
          points: {
            'secondary-or-less': { none: 0, clb7: 0, clb9: 0 },
            'one-year-plus': { none: 0, clb7: 13, clb9: 25 },
            'two-or-more-or-advanced': { none: 0, clb7: 25, clb9: 50 },
          },
        },
        {
          key: 'education-canadian-work',
          label: 'Education with Canadian work experience',
          subCap: 'education',
          rowInput: 'skillTransferEducationTier',
          columnInput: 'canadianWorkTier',
          points: {
            'secondary-or-less': { none: 0, one: 0, 'two-plus': 0 },
            'one-year-plus': { none: 0, one: 13, 'two-plus': 25 },
            'two-or-more-or-advanced': { none: 0, one: 25, 'two-plus': 50 },
          },
        },
        {
          key: 'foreign-work-language',
          label: 'Foreign work experience with official language proficiency',
          subCap: 'foreignWork',
          rowInput: 'foreignWorkTier',
          columnInput: 'firstLanguageTier',
          points: {
            none: { none: 0, clb7: 0, clb9: 0 },
            'one-to-two': { none: 0, clb7: 13, clb9: 25 },
            'three-plus': { none: 0, clb7: 25, clb9: 50 },
          },
        },
        {
          key: 'foreign-work-canadian-work',
          label: 'Foreign work experience with Canadian work experience',
          subCap: 'foreignWork',
          rowInput: 'foreignWorkTier',
          columnInput: 'canadianWorkTier',
          points: {
            none: { none: 0, one: 0, 'two-plus': 0 },
            'one-to-two': { none: 0, one: 13, 'two-plus': 25 },
            'three-plus': { none: 0, one: 25, 'two-plus': 50 },
          },
        },
        {
          // Note the thresholds: CLB 5 and 7, not the CLB 7 and 9 used above.
          key: 'certificate-language',
          label: 'Certificate of qualification with official language proficiency',
          subCap: 'certificate',
          rowInput: 'certificateTier',
          columnInput: 'certificateLanguageTier',
          points: {
            none: { none: 0, clb5: 0, clb7: 0 },
            'has-certificate': { none: 0, clb5: 25, clb7: 50 },
          },
        },
      ],
    },

    additional: {
      label: 'Additional points',
      cap: 600,
      factors: {
        siblingInCanada: {
          label: 'Sibling in Canada',
          input: 'siblingInCanada',
          mode: 'lookup',
          entries: [{ when: present, points: 15 }],
        },
        frenchLanguage: {
          label: 'French language skills',
          input: 'frenchBonusCategory',
          mode: 'lookup',
          entries: [
            { when: is('none'), points: 0 },
            { when: is('french-only'), points: 25 },
            { when: is('french-and-english'), points: 50 },
          ],
        },
        canadianEducation: {
          label: 'Post-secondary education in Canada',
          input: 'canadianEducationCredential',
          mode: 'lookup',
          entries: [
            { when: is('none'), points: 0 },
            { when: is('one-or-two-years'), points: 15 },
            { when: is('three-years-or-more'), points: 30 },
          ],
        },
        arrangedEmployment: {
          label: 'Arranged employment',
          input: 'jobOfferTier',
          mode: 'lookup',
          entries: [
            { when: is('none'), points: 0 },
            { when: is('noc-00'), points: 200 },
            { when: is('noc-0-a-b'), points: 50 },
          ],
        },
        provincialNomination: {
          label: 'Provincial or territorial nomination',
          input: 'provincialNomination',
          mode: 'lookup',
          entries: [{ when: present, points: 600 }],
        },
      },
    },
  },
});
