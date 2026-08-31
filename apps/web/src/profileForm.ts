/**
 * What the calculator form holds, and how to make an empty one.
 *
 * The form cannot hold a CRS Profile directly: a LanguageTest needs all four
 * abilities at once, and a half-filled test is a real state a user passes
 * through. So the form keeps four independent nullable abilities. Converting
 * between this shape and a Profile lives in profileMapping.ts.
 *
 * ARCHITECTURE.md section 6: nothing is inferred and nothing is defaulted.
 * Every field starts null, and null reaches score() as null.
 *
 * A Profile is personal information under PIPEDA, Law 25 and GDPR. Nothing here
 * logs one, stores one, or sends one anywhere.
 */
import type { CanadianEducationCredential, EducationLevel, OfficialLanguage } from './profile.ts';

export const LANGUAGE_ABILITIES = ['reading', 'writing', 'listening', 'speaking'] as const;
export type LanguageAbility = (typeof LANGUAGE_ABILITIES)[number];

export type LanguageForm = Record<LanguageAbility, number | null>;

export type SpouseForm = {
  educationLevel: EducationLevel | null;
  english: LanguageForm;
  french: LanguageForm;
  firstOfficialLanguage: OfficialLanguage | null;
  canadianWorkYears: number | null;
};

export type ProfileForm = {
  hasAccompanyingSpouse: boolean;
  age: number | null;
  educationLevel: EducationLevel | null;
  english: LanguageForm;
  french: LanguageForm;
  firstOfficialLanguage: OfficialLanguage | null;
  canadianWorkYears: number | null;
  foreignWorkYears: number | null;
  hasCertificateOfQualification: boolean | null;
  siblingInCanada: boolean | null;
  canadianEducationCredential: CanadianEducationCredential | null;
  provincialNomination: boolean | null;
  /** Always present so the fields keep their values while the box is unticked; only read when accompanying. */
  spouse: SpouseForm;
};

export function emptyLanguageForm(): LanguageForm {
  return { reading: null, writing: null, listening: null, speaking: null };
}

export function emptySpouseForm(): SpouseForm {
  return {
    educationLevel: null,
    english: emptyLanguageForm(),
    french: emptyLanguageForm(),
    firstOfficialLanguage: null,
    canadianWorkYears: null,
  };
}

export function emptyForm(): ProfileForm {
  return {
    hasAccompanyingSpouse: false,
    age: null,
    educationLevel: null,
    english: emptyLanguageForm(),
    french: emptyLanguageForm(),
    firstOfficialLanguage: null,
    canadianWorkYears: null,
    foreignWorkYears: null,
    hasCertificateOfQualification: null,
    siblingInCanada: null,
    canadianEducationCredential: null,
    provincialNomination: null,
    spouse: emptySpouseForm(),
  };
}

/** True once any ability is filled but not all four - the state worth warning about. */
export function isPartlyFilled(form: LanguageForm): boolean {
  const values = LANGUAGE_ABILITIES.map((ability) => form[ability]);
  return values.some((value) => value !== null) && values.some((value) => value === null);
}

/** Whether the user has told us anything at all about their spouse. */
export function hasAnySpouseDetail(spouse: SpouseForm): boolean {
  const languages = [spouse.english, spouse.french].flatMap((form) =>
    LANGUAGE_ABILITIES.map((ability) => form[ability]));
  return [spouse.educationLevel, spouse.firstOfficialLanguage, spouse.canadianWorkYears, ...languages]
    .some((value) => value !== null);
}
