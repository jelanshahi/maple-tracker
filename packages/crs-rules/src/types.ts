/**
 * Types for the CRS engine. Pure data - no behaviour lives here.
 *
 * The rule set is validated with zod at load so a malformed one fails loudly
 * rather than silently scoring everyone zero.
 */

import { z } from 'zod';

export const educationLevels = [
  'less-than-secondary',
  'secondary',
  'one-year-post-secondary',
  'two-year-post-secondary',
  'bachelors-or-three-year',
  'two-or-more-credentials',
  'masters-or-professional',
  'doctoral',
] as const;

export const canadianEducationCredentials = ['none', 'one-or-two-years', 'three-years-or-more'] as const;

/** Only ever awarded points by rule sets predating 25 March 2025. */
export const jobOfferTiers = ['none', 'noc-00', 'noc-0-a-b'] as const;

/**
 * Four abilities, never one aggregate. Core language points are awarded per
 * ability, so 9/9/9/7 and 7/7/7/7 do not score the same. A UI may offer a
 * "same for all four" shortcut; the engine must never accept one as its input.
 */
export const languageTestSchema = z.object({
  reading: z.number().int().min(0),
  writing: z.number().int().min(0),
  listening: z.number().int().min(0),
  speaking: z.number().int().min(0),
});
export type LanguageTest = z.infer<typeof languageTestSchema>;

export const spouseProfileSchema = z.object({
  educationLevel: z.enum(educationLevels).nullable(),
  english: languageTestSchema.nullable(),
  french: languageTestSchema.nullable(),
  /**
   * The spouse chooses their own first official language, independently of the
   * principal applicant. IRCC's calculator asks which test the spouse took as a
   * separate question, and a couple applying in different languages is ordinary
   * rather than exotic - deriving this from the applicant's choice scored a
   * spouse with a perfect test in the other language zero out of twenty.
   */
  firstOfficialLanguage: z.enum(['english', 'french']).nullable(),
  canadianWorkYears: z.number().int().min(0).nullable(),
});

/**
 * Personal information under PIPEDA, Law 25 and GDPR. Never log one, never put
 * one in an error message, never send one anywhere.
 */
export const profileSchema = z.object({
  hasAccompanyingSpouse: z.boolean(),
  age: z.number().int().min(0).nullable(),
  educationLevel: z.enum(educationLevels).nullable(),
  english: languageTestSchema.nullable(),
  french: languageTestSchema.nullable(),
  /** Which language IRCC treats as first official. Nothing is inferred if absent. */
  firstOfficialLanguage: z.enum(['english', 'french']).nullable(),
  canadianWorkYears: z.number().int().min(0).nullable(),
  foreignWorkYears: z.number().int().min(0).nullable(),
  hasCertificateOfQualification: z.boolean().nullable(),
  siblingInCanada: z.boolean().nullable(),
  canadianEducationCredential: z.enum(canadianEducationCredentials).nullable(),
  provincialNomination: z.boolean().nullable(),
  jobOfferTier: z.enum(jobOfferTiers).nullable(),
  spouse: spouseProfileSchema.nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export type FactorScore = { key: string; label: string; points: number; explanation: string };
export type SectionScore = { key: string; label: string; points: number; cap: number; capReached: boolean };

export type ScoreResult = {
  total: number;
  ruleSetId: string;
  sections: SectionScore[];
  factors: FactorScore[];
  warnings: string[];
};
