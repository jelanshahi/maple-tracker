/**
 * The form's state, and the pure mapping from it to a CRS Profile.
 *
 * The form cannot hold a Profile directly: a LanguageTest needs all four
 * abilities at once, and a half-filled test is a real state a user passes
 * through. So the form keeps four independent nullable abilities and this
 * module collapses them - which also puts the entire form-to-Profile mapping
 * in a pure function that tests can drive without a DOM.
 *
 * ARCHITECTURE.md section 6: nothing is inferred and nothing is defaulted.
 * Every field starts null, and null reaches score() as null.
 *
 * A Profile is personal information under PIPEDA, Law 25 and GDPR. Nothing here
 * logs one, stores one, or sends one anywhere.
 */
import type { LanguageTest, Profile } from '@maple/crs-rules';
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

/**
 * All four abilities or nothing. A partly filled test is not a test result, and
 * scoring the blanks as zero would quietly invent a bad result rather than
 * report a missing one.
 */
export function toLanguageTest(form: LanguageForm): LanguageTest | null {
  const { reading, writing, listening, speaking } = form;
  if (reading === null || writing === null || listening === null || speaking === null) return null;
  return { reading, writing, listening, speaking };
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

export function toProfile(form: ProfileForm): Profile {
  return {
    hasAccompanyingSpouse: form.hasAccompanyingSpouse,
    age: form.age,
    educationLevel: form.educationLevel,
    english: toLanguageTest(form.english),
    french: toLanguageTest(form.french),
    firstOfficialLanguage: form.firstOfficialLanguage,
    canadianWorkYears: form.canadianWorkYears,
    foreignWorkYears: form.foreignWorkYears,
    hasCertificateOfQualification: form.hasCertificateOfQualification,
    siblingInCanada: form.siblingInCanada,
    canadianEducationCredential: form.canadianEducationCredential,
    provincialNomination: form.provincialNomination,
    // No control offers a job offer. Arranged employment was removed on
    // 25 March 2025 and crs-current awards it nothing, so a field for it would
    // be a field that silently does nothing - see CLAUDE.md.
    jobOfferTier: null,
    // Spouse details are scored only when a spouse is actually coming along.
    // Unticking the box must drop them, not leave them scoring in the
    // background, so this reads the box rather than the details.
    //
    // A ticked box with nothing filled in maps to null rather than to an object
    // of nulls, because those are different states and score() distinguishes
    // them. Null earns the one warning that matters here - that core has
    // dropped to the lower with-spouse scale and the spouse section is paying
    // nothing back. An object of nulls earns four ordinary "not answered"
    // warnings that never mention the points already lost.
    spouse: form.hasAccompanyingSpouse && hasAnySpouseDetail(form.spouse)
      ? {
        educationLevel: form.spouse.educationLevel,
        english: toLanguageTest(form.spouse.english),
        french: toLanguageTest(form.spouse.french),
        firstOfficialLanguage: form.spouse.firstOfficialLanguage,
        canadianWorkYears: form.spouse.canadianWorkYears,
      }
      : null,
  };
}
