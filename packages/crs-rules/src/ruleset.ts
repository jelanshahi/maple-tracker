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
import { languageInputNames, scalarInputNames } from './inputs.ts';

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

const scalars: ReadonlySet<string> = new Set(scalarInputNames);
const languages: ReadonlySet<string> = new Set(languageInputNames);

/**
 * Referential integrity: every name a rule set uses must actually resolve.
 *
 * The shape checks above accept any string, which is how two silent
 * mis-scorings got through. A `subCap` naming a group absent from `subCaps`
 * inherited no cap at all and doubled skill transferability from 50 to 100; an
 * `input` with a typo looked in the right bag for the wrong key, found nothing,
 * and scored the factor zero while telling the candidate they had not supplied
 * it. Both are one mistyped character, and neither is visible in the output.
 *
 * They fail here instead, at load, naming the path - so the cost is a thrown
 * error the first time the rule set is imported, which is a test failure rather
 * than a wrong answer someone acts on.
 */
function checkReferences(ruleSet: RuleSet, ctx: z.RefinementCtx): void {
  for (const [sectionKey, section] of Object.entries(ruleSet.sections)) {
    if (!('factors' in section)) continue;
    for (const [factorKey, table] of Object.entries(section.factors)) {
      const known = table.mode === 'perAbility' ? languages : scalars;
      if (!known.has(table.input)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sections', sectionKey, 'factors', factorKey, 'input'],
          message: `unknown ${table.mode} input ${JSON.stringify(table.input)}`,
        });
      }
    }
  }

  const { skillTransfer } = ruleSet.sections;
  for (const [index, combination] of skillTransfer.combinations.entries()) {
    const at = (field: string) => ['sections', 'skillTransfer', 'combinations', index, field];
    for (const field of ['rowInput', 'columnInput'] as const) {
      if (!scalars.has(combination[field])) {
        ctx.addIssue({ code: 'custom', path: at(field), message: `unknown input ${JSON.stringify(combination[field])}` });
      }
    }
    if (!Object.hasOwn(skillTransfer.subCaps, combination.subCap)) {
      ctx.addIssue({
        code: 'custom',
        path: at('subCap'),
        message: `subCap ${JSON.stringify(combination.subCap)} is not declared in subCaps`,
      });
    }
    // A ragged grid means one row is missing a column, which scores 0 for
    // whoever lands on it and looks exactly like a legitimate zero.
    const rows = Object.entries(combination.points);
    const columnsOf = (row: Record<string, number>) => Object.keys(row).sort().join(',');
    const first = rows[0];
    if (first !== undefined) {
      for (const [rowKey, row] of rows) {
        if (columnsOf(row) !== columnsOf(first[1])) {
          ctx.addIssue({
            code: 'custom',
            path: at('points'),
            message: `row ${JSON.stringify(rowKey)} does not have the same columns as ${JSON.stringify(first[0])}`,
          });
        }
      }
    }
  }
}

/** Throws on a malformed rule set rather than silently scoring everyone zero. */
export function parseRuleSet(candidate: unknown): RuleSet {
  return ruleSetSchema.superRefine(checkReferences).parse(candidate);
}
