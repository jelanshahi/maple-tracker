/**
 * Between the form's state and the engine's Profile, in both directions.
 *
 * Pure, so the whole mapping is testable without a DOM - which matters, because
 * a mis-mapped field here is a wrong score on a page about somebody's
 * immigration prospects, and the engine itself is already proven.
 *
 * A Profile is personal information under PIPEDA, Law 25 and GDPR. Nothing here
 * logs one or sends one anywhere.
 */
import type { LanguageTest, Profile } from '@maple/crs-rules';
import { emptyLanguageForm, emptySpouseForm, hasAnySpouseDetail } from './profileForm.ts';
import type { LanguageForm, ProfileForm } from './profileForm.ts';

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

function toLanguageForm(test: LanguageTest | null): LanguageForm {
  if (test === null) return emptyLanguageForm();
  const { reading, writing, listening, speaking } = test;
  return { reading, writing, listening, speaking };
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

/**
 * The inverse, for restoring a saved profile into the form.
 *
 * Not quite a perfect round trip, and deliberately: a Profile carries
 * jobOfferTier and the form has no control for it, because arranged employment
 * was removed on 25 March 2025 and crs-current awards it nothing. toProfile
 * always sends null, so `toProfile(toForm(p))` equals `p` for every profile
 * this app can have produced.
 *
 * A null spouse becomes an empty spouse form rather than being dropped, so the
 * fields are there and blank if the user ticks the box.
 */
export function toForm(profile: Profile): ProfileForm {
  return {
    hasAccompanyingSpouse: profile.hasAccompanyingSpouse,
    age: profile.age,
    educationLevel: profile.educationLevel,
    english: toLanguageForm(profile.english),
    french: toLanguageForm(profile.french),
    firstOfficialLanguage: profile.firstOfficialLanguage,
    canadianWorkYears: profile.canadianWorkYears,
    foreignWorkYears: profile.foreignWorkYears,
    hasCertificateOfQualification: profile.hasCertificateOfQualification,
    siblingInCanada: profile.siblingInCanada,
    canadianEducationCredential: profile.canadianEducationCredential,
    provincialNomination: profile.provincialNomination,
    spouse: profile.spouse === null ? emptySpouseForm() : {
      educationLevel: profile.spouse.educationLevel,
      english: toLanguageForm(profile.spouse.english),
      french: toLanguageForm(profile.spouse.french),
      firstOfficialLanguage: profile.spouse.firstOfficialLanguage,
      canadianWorkYears: profile.spouse.canadianWorkYears,
    },
  };
}
