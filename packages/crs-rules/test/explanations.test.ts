/**
 * Warnings and explanations are read by people.
 *
 * apps/web renders every factor's explanation beside its points, and every
 * warning above the score. They used to be written for whoever was debugging a
 * failure, and said things like "scored 0 because firstOfficial was not
 * supplied" and "siblingInCanada true scores 15" - the rule set's own internal
 * vocabulary, on a page about somebody's immigration prospects.
 *
 * These strings are presentation, so this asserts they stay readable rather
 * than leaving it to whoever next opens the page.
 */
import { describe, expect, it } from 'vitest';
import { languageInputNames, scalarInputNames } from '../src/inputs.ts';
import { crs2024 } from '../src/rulesets/crs-2024.ts';
import { crsCurrent } from '../src/rulesets/crs-current.ts';
import { score } from '../src/score.ts';
import { blank, clb, complete } from './fixtures.ts';

const inputNames = [...scalarInputNames, ...languageInputNames];

const profiles = {
  'nothing supplied': blank,
  'fully specified': complete({}),
  'partly specified': complete({ educationLevel: null, english: null }),
  'spouse accompanying, no details': { ...complete({}), hasAccompanyingSpouse: true },
  'maximum': complete({
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
};

/**
 * Whole words only. "language" ends in "age", and the input list contains
 * "age" - a bare substring check fails on the rule set's own factor labels.
 */
function leakedNames(text: string): string[] {
  return inputNames.filter((name) => new RegExp(`\\b${name}\\b`).test(text));
}

describe.each(Object.entries(profiles))('%s', (_name, profile) => {
  const results = [score(profile, crsCurrent), score(profile, crs2024)];

  it('names no internal input in any factor explanation', () => {
    const leaks = results.flatMap((result) =>
      result.factors.flatMap((factor) => leakedNames(factor.explanation).map((name) => `${factor.key}: ${name}`)),
    );
    expect(leaks).toStrictEqual([]);
  });

  it('names no internal input in any warning', () => {
    expect(results.flatMap((result) => result.warnings.flatMap(leakedNames))).toStrictEqual([]);
  });

  it('never renders a null into an explanation', () => {
    const nulls = results.flatMap((result) =>
      result.factors.filter((factor) => /\bnull\b|\bundefined\b|\bNaN\b/.test(factor.explanation)),
    );
    expect(nulls).toStrictEqual([]);
  });

  it('gives every factor a non-empty explanation, since the page renders one per row', () => {
    const blanks = results.flatMap((result) =>
      result.factors.filter((factor) => factor.explanation.trim() === '').map((factor) => factor.key),
    );
    expect(blanks).toStrictEqual([]);
  });
});

describe('a scored value reads as an answer rather than as a field', () => {
  it('renders a true boolean as yes', () => {
    const result = score(complete({ siblingInCanada: true }), crsCurrent);
    expect(result.factors.find((factor) => factor.key === 'siblingInCanada')?.explanation)
      .toBe('yes, which scores 15');
  });

  it('renders a false boolean as no', () => {
    const result = score(complete({ siblingInCanada: false }), crsCurrent);
    expect(result.factors.find((factor) => factor.key === 'siblingInCanada')?.explanation)
      .toBe('no, which scores 0');
  });
});
