/**
 * Evaluating the condition language and the factor tables. Pure.
 *
 * Nothing in this file knows what any factor means. It looks up a named input,
 * finds the first entry whose condition matches, and reads the award from the
 * rule set. That is what lets a whole new rule set be added without touching
 * any code.
 */

import { readLanguage, readScalar } from './inputs.ts';
import type { DerivedInputs, Scalar } from './inputs.ts';
import type { Condition, FactorTable, Points } from './ruleset.ts';
import type { FactorScore, LanguageTest } from './types.ts';

export function resolvePoints(points: Points, hasSpouse: boolean): number {
  if (typeof points === 'number') return points;
  return hasSpouse ? points.withSpouse : points.withoutSpouse;
}

export function matches(condition: Condition, value: Scalar): boolean {
  if (value === null) return false;
  switch (condition.kind) {
    case 'eq':
      return value === condition.value;
    case 'range':
      return typeof value === 'number'
        && (condition.min === undefined || value >= condition.min)
        && (condition.max === undefined || value <= condition.max);
    case 'present':
      return value === true;
  }
}

/** First match wins, so rule-set entries are read in the order they are written. */
function award(table: FactorTable, value: Scalar, hasSpouse: boolean): number {
  const entry = table.entries.find((candidate) => matches(candidate.when, value));
  return entry === undefined ? 0 : resolvePoints(entry.points, hasSpouse);
}

const abilitiesOf = (test: LanguageTest): number[] => [test.reading, test.writing, test.listening, test.speaking];

export type FactorOutcome = { score: FactorScore; missingInput: boolean };

/**
 * How a scored value reads in an explanation.
 *
 * Explanations are shown to people - apps/web renders them beside every factor -
 * so they must not carry the internal input names a rule set happens to use.
 * "siblingInCanada true scores 15" describes the implementation; "yes, which
 * scores 15" describes the answer the user gave. The factor's own label already
 * says which question it was.
 */
function describeValue(value: string | number | boolean): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return String(value);
}

/** What a factor with nothing to score says. Never blames an input name. */
const NOT_ANSWERED = 'not answered, so nothing was scored';

export function evaluateFactor(
  key: string,
  table: FactorTable,
  inputs: DerivedInputs,
  hasSpouse: boolean,
): FactorOutcome {
  if (table.mode === 'perAbility') {
    const test = readLanguage(inputs, table.input);
    if (test === null) {
      return { score: { key, label: table.label, points: 0, explanation: NOT_ANSWERED }, missingInput: true };
    }
    // Summed per ability, which is why 9/9/9/7 and 7/7/7/7 differ.
    const raw = abilitiesOf(test).reduce((total, clb) => total + award(table, clb, hasSpouse), 0);
    const points = capped(raw, table, hasSpouse);
    return {
      score: { key, label: table.label, points, explanation: `${points} points across four abilities` },
      missingInput: false,
    };
  }

  const value = readScalar(inputs, table.input);
  if (value === null) {
    return { score: { key, label: table.label, points: 0, explanation: NOT_ANSWERED }, missingInput: true };
  }
  const points = capped(award(table, value, hasSpouse), table, hasSpouse);
  return {
    score: { key, label: table.label, points, explanation: `${describeValue(value)}, which scores ${points}` },
    missingInput: false,
  };
}

function capped(raw: number, table: FactorTable, hasSpouse: boolean): number {
  if (table.cap === undefined) return raw;
  return Math.min(raw, resolvePoints(table.cap, hasSpouse));
}
