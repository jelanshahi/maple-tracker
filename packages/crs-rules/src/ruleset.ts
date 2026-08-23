/**
 * The rule-set shape and its condition language.
 *
 * The condition language is deliberately tiny: equality, an inclusive numeric
 * range, and boolean-presence. That is the whole vocabulary. It exists so rules
 * can be data without being code - there is no eval, no new Function, and no
 * expression parser to be hostile to.
 *
 * A rule that cannot be expressed in it does not get the language extended; it
 * becomes a named factor with its numbers still coming from the rule set.
 */

import { z } from 'zod';

export const conditionSchema = z.union([
  z.object({ kind: z.literal('eq'), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ kind: z.literal('range'), min: z.number().optional(), max: z.number().optional() }),
  z.object({ kind: z.literal('present') }),
]);
export type Condition = z.infer<typeof conditionSchema>;

/**
 * A plain number where the award is the same either way; the pair where IRCC
 * publishes two columns, which it does for every core factor.
 */
export const pointsSchema = z.union([
  z.number(),
  z.object({ withSpouse: z.number(), withoutSpouse: z.number() }),
]);
export type Points = z.infer<typeof pointsSchema>;

export const factorTableSchema = z.object({
  label: z.string(),
  /** Name of a derived input. score.ts never learns what any of them mean. */
  input: z.string(),
  /**
   * 'lookup' reads one scalar input.
   * 'perAbility' reads a named language and applies the table to each of the
   * four abilities, summing the result - which is why 9/9/9/7 and 7/7/7/7 score
   * differently.
   */
  mode: z.enum(['lookup', 'perAbility']),
  cap: pointsSchema.optional(),
  entries: z.array(z.object({ when: conditionSchema, points: pointsSchema })),
});
export type FactorTable = z.infer<typeof factorTableSchema>;

/**
 * Skill transferability is the one place points depend on two inputs at once,
 * so it gets a grid rather than a flat table. Still data, still no code.
 */
export const combinationSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Which sub-cap group this grid counts towards. */
  subCap: z.string(),
  rowInput: z.string(),
  columnInput: z.string(),
  points: z.record(z.string(), z.record(z.string(), z.number())),
});
export type Combination = z.infer<typeof combinationSchema>;

const factorsSchema = z.record(z.string(), factorTableSchema);

export const ruleSetSchema = z.object({
  id: z.string(),
  label: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  status: z.enum(['active', 'superseded', 'proposed']),
  sourceUrl: z.string(),
  maxTotal: z.number(),
  sections: z.object({
    core: z.object({ label: z.string(), cap: pointsSchema, factors: factorsSchema }),
    spouse: z.object({ label: z.string(), cap: pointsSchema, factors: factorsSchema }),
    skillTransfer: z.object({
      label: z.string(),
      cap: pointsSchema,
      subCaps: z.record(z.string(), pointsSchema),
      combinations: z.array(combinationSchema),
    }),
    additional: z.object({ label: z.string(), cap: pointsSchema, factors: factorsSchema }),
  }),
});
export type RuleSet = z.infer<typeof ruleSetSchema>;

/** Throws on a malformed rule set rather than silently scoring everyone zero. */
export function parseRuleSet(candidate: unknown): RuleSet {
  return ruleSetSchema.parse(candidate);
}
