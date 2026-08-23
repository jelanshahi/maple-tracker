/**
 * The interpreter. Pure and synchronous: no Date.now(), no network, no
 * database, no env, no randomness. Same inputs, same output, forever.
 *
 * score.ts contains no points values and no knowledge of what any factor means.
 * It walks whatever factor keys the rule set declares. That is the test of
 * whether rules really are data: adding a rule set must not touch this file.
 */

import { deriveInputs } from './inputs.ts';
import type { DerivedInputs } from './inputs.ts';
import type { RuleSet } from './ruleset.ts';
import { evaluateFactor, resolvePoints } from './tables.ts';
import type { FactorScore, Profile, ScoreResult, SectionScore } from './types.ts';

type SectionOutcome = { section: SectionScore; factors: FactorScore[]; warnings: string[] };

/** Caps apply to the section total after summing, never per item. */
function applyCap(key: string, label: string, raw: number, cap: number): SectionScore {
  return { key, label, points: Math.min(raw, cap), cap, capReached: raw >= cap };
}

function scoreFactorSection(
  key: string,
  section: { label: string; cap: RuleSet['sections']['core']['cap']; factors: RuleSet['sections']['core']['factors'] },
  inputs: DerivedInputs,
  hasSpouse: boolean,
): SectionOutcome {
  const factors: FactorScore[] = [];
  const warnings: string[] = [];

  for (const [factorKey, table] of Object.entries(section.factors)) {
    const outcome = evaluateFactor(factorKey, table, inputs, hasSpouse);
    factors.push(outcome.score);
    if (outcome.missingInput) {
      warnings.push(`${table.label}: scored 0 because ${table.input} was not supplied`);
    }
  }

  const raw = factors.reduce((total, factor) => total + factor.points, 0);
  return { section: applyCap(key, section.label, raw, resolvePoints(section.cap, hasSpouse)), factors, warnings };
}

/**
 * Skill transferability: each grid reads two inputs, grids are grouped into
 * sub-capped pairs, and the section caps again over the whole.
 */
function scoreSkillTransfer(
  section: RuleSet['sections']['skillTransfer'],
  inputs: DerivedInputs,
  hasSpouse: boolean,
): SectionOutcome {
  const factors: FactorScore[] = [];
  const warnings: string[] = [];
  const subTotals = new Map<string, number>();

  for (const combination of section.combinations) {
    const row = inputs.scalars[combination.rowInput] ?? null;
    const column = inputs.scalars[combination.columnInput] ?? null;
    if (row === null || column === null) {
      const missing = row === null ? combination.rowInput : combination.columnInput;
      warnings.push(`${combination.label}: scored 0 because ${missing} was not supplied`);
    }
    const points = row === null || column === null
      ? 0
      : combination.points[String(row)]?.[String(column)] ?? 0;

    factors.push({
      key: combination.key,
      label: combination.label,
      points,
      explanation: `${String(row)} with ${String(column)} scores ${points}`,
    });
    subTotals.set(combination.subCap, (subTotals.get(combination.subCap) ?? 0) + points);
  }

  // Each pair caps on its own before the section cap applies to the total.
  let raw = 0;
  for (const [group, total] of subTotals) {
    const groupCap = section.subCaps[group];
    raw += groupCap === undefined ? total : Math.min(total, resolvePoints(groupCap, hasSpouse));
  }

  return {
    section: applyCap('skillTransfer', section.label, raw, resolvePoints(section.cap, hasSpouse)),
    factors,
    warnings,
  };
}

export function score(profile: Profile, ruleSet: RuleSet): ScoreResult {
  const hasSpouse = profile.hasAccompanyingSpouse;
  const inputs = deriveInputs(profile);
  const { core, spouse, skillTransfer, additional } = ruleSet.sections;

  const outcomes: SectionOutcome[] = [
    scoreFactorSection('core', core, inputs, hasSpouse),
    // Spouse factors apply only when a spouse is actually coming along.
    hasSpouse && profile.spouse !== null
      ? scoreFactorSection('spouse', spouse, inputs, hasSpouse)
      : { section: applyCap('spouse', spouse.label, 0, resolvePoints(spouse.cap, hasSpouse)), factors: [], warnings: [] },
    scoreSkillTransfer(skillTransfer, inputs, hasSpouse),
    scoreFactorSection('additional', additional, inputs, hasSpouse),
  ];

  const total = outcomes.reduce((sum, outcome) => sum + outcome.section.points, 0);

  return {
    total: Math.min(total, ruleSet.maxTotal),
    ruleSetId: ruleSet.id,
    sections: outcomes.map((outcome) => outcome.section),
    factors: outcomes.flatMap((outcome) => outcome.factors),
    warnings: outcomes.flatMap((outcome) => outcome.warnings),
  };
}
