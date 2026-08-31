/**
 * The vocabulary the calculator's controls need: human labels for the codes
 * crs-rules works in, and the one parser the number fields use. Pure - no
 * React, no I/O.
 *
 * Labels live here rather than in the rule set because they are presentation.
 * The rule set carries points and the codes they attach to; what to call
 * 'bachelors-or-three-year' on a page is this app's problem.
 */
import { canadianEducationCredentials, educationLevels } from '@maple/crs-rules';

export type EducationLevel = (typeof educationLevels)[number];
export type CanadianEducationCredential = (typeof canadianEducationCredentials)[number];
export type OfficialLanguage = 'english' | 'french';

/**
 * Keyed on the crs-rules const arrays rather than written as a loose object, so
 * adding an education level upstream fails typecheck here instead of quietly
 * rendering a blank option.
 */
export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  'less-than-secondary': 'Less than secondary school',
  secondary: 'Secondary school (high school)',
  'one-year-post-secondary': 'One-year post-secondary credential',
  'two-year-post-secondary': 'Two-year post-secondary credential',
  'bachelors-or-three-year': "Bachelor's degree, or another credential of three years or longer",
  'two-or-more-credentials': 'Two or more credentials, one of them three years or longer',
  'masters-or-professional': "Master's degree, or a professional degree",
  doctoral: 'Doctoral degree (PhD)',
};

export const CANADIAN_EDUCATION_LABELS: Record<CanadianEducationCredential, string> = {
  none: 'No Canadian credential',
  'one-or-two-years': 'A one- or two-year Canadian credential',
  'three-years-or-more': 'A Canadian credential of three years or longer',
};

export const OFFICIAL_LANGUAGE_LABELS: Record<OfficialLanguage, string> = {
  english: 'English',
  french: 'French',
};

/** CLB and NCLC both run to 10, where 10 covers every result above it. */
export const CLB_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function clbLabel(level: number): string {
  return level === 10 ? '10 or higher' : String(level);
}

/**
 * A count the user typed, as a whole number of years or a whole age. Anything
 * else - blank, negative, fractional - comes back null, meaning unsupplied,
 * rather than being coerced into a number nobody entered. ARCHITECTURE.md
 * section 6: never infer. Unsupplied scores zero and warns, which is visible;
 * a silently coerced value is not.
 */
export function parseCount(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}
