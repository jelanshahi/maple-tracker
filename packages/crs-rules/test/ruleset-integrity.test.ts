/**
 * Regressions for four ways the engine could be wrong without saying so.
 *
 * All four came out of a code review and were confirmed by running them before
 * anything was changed. What they share is a failure mode: the engine kept
 * scoring, produced a plausible number, and either said nothing or blamed the
 * candidate for a mistake that was not theirs. A wrong answer nobody can see is
 * worse than a crash, and these are scores people make decisions on.
 */

import { describe, expect, it } from 'vitest';
import { parseRuleSet } from '../src/ruleset.ts';
import { score } from '../src/score.ts';
import { crsCurrent } from '../src/rulesets/crs-current.ts';
import type { Profile } from '../src/types.ts';
import { clb, complete } from './fixtures.ts';

/** Just the parts these tests deliberately break. */
type Draft = {
  sections: {
    core: { factors: Record<string, { input: string; mode: string }> };
    skillTransfer: {
      combinations: Array<{
        subCap: string;
        rowInput: string;
        columnInput: string;
        points: Record<string, Record<string, number>>;
      }>;
    };
  };
};

/** A deep copy, so a mutation in one test cannot leak into another. */
function draft(): Draft {
  return JSON.parse(JSON.stringify(crsCurrent));
}

function coreFactor(bad: Draft, name: string): { input: string; mode: string } {
  const factor = bad.sections.core.factors[name];
  if (factor === undefined) throw new Error(`fixture drift: no core factor ${name}`);
  return factor;
}

function firstCombination(bad: Draft): Draft['sections']['skillTransfer']['combinations'][number] {
  const combination = bad.sections.skillTransfer.combinations[0];
  if (combination === undefined) throw new Error('fixture drift: no combinations');
  return combination;
}

describe('an accompanying spouse with no spouse details', () => {
  const declared = complete({ hasAccompanyingSpouse: true, spouse: null });

  it('warns rather than quietly charging the with-spouse scale', () => {
    const result = score(declared, crsCurrent);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('no spouse details were supplied');
    // The warning has to mention this: it is where the points actually went.
    expect(result.warnings[0]).toContain('with-spouse scale');
  });

  it('still scores the profile it was given rather than guessing', () => {
    // 353, not the 379 the same person scores single. The engine must not
    // quietly promote them back by pretending the spouse is not coming.
    expect(score(declared, crsCurrent).total).toBe(353);
    expect(score(complete({}), crsCurrent).total).toBe(379);
  });

  it('says nothing when no spouse is accompanying, which is not a gap', () => {
    expect(score(complete({ hasAccompanyingSpouse: false, spouse: null }), crsCurrent).warnings).toEqual([]);
  });
});

describe('parseRuleSet rejects a name that does not resolve', () => {
  it('refuses a factor input that is not a derived input', () => {
    const bad = draft();
    // One transposed character. This used to score every candidate 0 on their
    // first official language - 136 points - and blame them in the warning.
    coreFactor(bad, 'firstOfficialLanguage').input = 'firstOffical';
    expect(() => parseRuleSet(bad)).toThrow(/firstOffical/);
  });

  it('refuses a lookup input that names a language', () => {
    const bad = draft();
    coreFactor(bad, 'age').input = 'firstOfficial';
    expect(() => parseRuleSet(bad)).toThrow(/unknown lookup input/);
  });

  it('refuses a perAbility input that names a scalar', () => {
    const bad = draft();
    coreFactor(bad, 'firstOfficialLanguage').input = 'age';
    expect(() => parseRuleSet(bad)).toThrow(/unknown perAbility input/);
  });

  it('refuses a skill-transferability row that does not resolve', () => {
    const bad = draft();
    firstCombination(bad).rowInput = 'skillTransferEducationTeir';
    expect(() => parseRuleSet(bad)).toThrow(/skillTransferEducationTeir/);
  });

  it('refuses a subCap that is not declared', () => {
    const bad = draft();
    // Undeclared groups inherited no cap at all, so this one typo took skill
    // transferability from 50 to 100 with nothing in the output to show it.
    for (const combination of bad.sections.skillTransfer.combinations) {
      if (combination.subCap === 'education') combination.subCap = 'eduction';
    }
    expect(() => parseRuleSet(bad)).toThrow(/eduction/);
  });

  it('refuses a grid whose rows do not share the same columns', () => {
    const bad = draft();
    const row = firstCombination(bad).points['one-year-plus'];
    if (row === undefined) throw new Error('fixture drift: expected row missing');
    delete row.clb9;
    expect(() => parseRuleSet(bad)).toThrow(/same columns/);
  });

  it('still accepts the rule sets we ship', () => {
    expect(() => parseRuleSet(draft())).not.toThrow();
  });
});

describe('the spouse declares their own first official language', () => {
  const frenchSpouse: NonNullable<Profile['spouse']> = {
    educationLevel: 'bachelors-or-three-year',
    english: null,
    french: clb(10),
    firstOfficialLanguage: 'french',
    canadianWorkYears: 0,
  };
  const withSpouse = (spouse: NonNullable<Profile['spouse']>) =>
    complete({ hasAccompanyingSpouse: true, firstOfficialLanguage: 'english', spouse });
  const mixedCouple = withSpouse(frenchSpouse);

  it('scores a spouse tested in the other official language', () => {
    const result = score(mixedCouple, crsCurrent);
    // Used to be 0 of 20, with a warning blaming the candidate for an input
    // they had in fact supplied. Four abilities at CLB 10 pay 5 each.
    expect(result.factors.find((f) => f.key === 'spouseLanguage')?.points).toBe(20);
    expect(result.warnings).toEqual([]);
  });

  it('does not read the applicant\'s choice onto the spouse', () => {
    // Same spouse, same tests, only the spouse's declaration differs. If the
    // applicant's English were still driving this, both would score alike.
    const declaresEnglish = withSpouse({ ...frenchSpouse, firstOfficialLanguage: 'english' });
    expect(score(declaresEnglish, crsCurrent).factors.find((f) => f.key === 'spouseLanguage')?.points).toBe(0);
  });

  it('infers nothing when the spouse declares no first official language', () => {
    const undeclared = withSpouse({ ...frenchSpouse, firstOfficialLanguage: null });
    const result = score(undeclared, crsCurrent);
    expect(result.factors.find((f) => f.key === 'spouseLanguage')?.points).toBe(0);
    expect(result.warnings.some((w) => w.startsWith('Official language proficiency (spouse):'))).toBe(true);
  });
});

describe('sub-caps fail closed', () => {
  it('caps the education pair at 50 even when a candidate maxes both grids', () => {
    const maxed = complete({ educationLevel: 'doctoral', english: clb(10), canadianWorkYears: 5 });
    const result = score(maxed, crsCurrent);
    // 50 + 50 of raw grid points, capped to the pair's 50 before the section
    // cap. An uncapped group would surface here as 100.
    expect(result.sections.find((s) => s.key === 'skillTransfer')?.points).toBe(50);
  });
});
