/**
 * Public surface of the package. Explicit exports only - no re-export barrel.
 */

export { score } from './score.ts';
export { parseRuleSet, ruleSetSchema } from './ruleset.ts';
export type { Combination, Condition, FactorTable, Points, RuleSet } from './ruleset.ts';
export { crsCurrent } from './rulesets/crs-current.ts';
export { crs2024 } from './rulesets/crs-2024.ts';
export { canadianEducationCredentials, educationLevels, jobOfferTiers, profileSchema } from './types.ts';
export type { FactorScore, LanguageTest, Profile, ScoreResult, SectionScore } from './types.ts';
