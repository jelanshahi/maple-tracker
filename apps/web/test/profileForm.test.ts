import { crsCurrent, profileSchema, score } from '@maple/crs-rules';
import { describe, expect, it } from 'vitest';
import {
  emptyForm, emptyLanguageForm, emptySpouseForm, hasAnySpouseDetail, isPartlyFilled,
} from '../src/profileForm.ts';
import { toLanguageTest, toProfile } from '../src/profileMapping.ts';
import type { LanguageForm, ProfileForm } from '../src/profileForm.ts';

const clb = (level: number): LanguageForm => ({
  reading: level,
  writing: level,
  listening: level,
  speaking: level,
});

describe('emptyForm', () => {
  it('produces a Profile the engine accepts', () => {
    expect(() => profileSchema.parse(toProfile(emptyForm()))).not.toThrow();
  });

  it('supplies nothing at all, so nothing is scored on an answer the user did not give', () => {
    const profile = toProfile(emptyForm());
    const supplied = Object.entries(profile).filter(([, value]) => value !== null && value !== false);
    expect(supplied).toStrictEqual([]);
  });

  it('scores zero and warns rather than scoring zero silently', () => {
    const result = score(toProfile(emptyForm()), crsCurrent);
    expect(result.total).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('toLanguageTest', () => {
  it('collapses four abilities into a test result', () => {
    expect(toLanguageTest({ reading: 9, writing: 8, listening: 9, speaking: 7 })).toStrictEqual({
      reading: 9,
      writing: 8,
      listening: 9,
      speaking: 7,
    });
  });

  it('keeps uneven abilities distinct, which is the whole reason the engine takes four', () => {
    const uneven = toLanguageTest({ reading: 9, writing: 9, listening: 9, speaking: 7 });
    const flat = toLanguageTest(clb(9));
    expect(uneven).not.toStrictEqual(flat);
  });

  it('treats a partly filled test as no test result rather than scoring the blanks as zero', () => {
    expect(toLanguageTest({ reading: 9, writing: 9, listening: 9, speaking: null })).toBeNull();
    expect(toLanguageTest(emptyLanguageForm())).toBeNull();
  });
});

describe('isPartlyFilled', () => {
  it('is true only between empty and complete, where the warning belongs', () => {
    expect(isPartlyFilled(emptyLanguageForm())).toBe(false);
    expect(isPartlyFilled(clb(9))).toBe(false);
    expect(isPartlyFilled({ reading: 9, writing: null, listening: null, speaking: null })).toBe(true);
  });
});

describe('toProfile', () => {
  const filled: ProfileForm = {
    hasAccompanyingSpouse: true,
    age: 29,
    educationLevel: 'masters-or-professional',
    english: clb(9),
    french: clb(7),
    firstOfficialLanguage: 'english',
    canadianWorkYears: 3,
    foreignWorkYears: 2,
    hasCertificateOfQualification: false,
    siblingInCanada: true,
    canadianEducationCredential: 'three-years-or-more',
    provincialNomination: false,
    spouse: {
      educationLevel: 'bachelors-or-three-year',
      english: clb(8),
      french: emptyLanguageForm(),
      firstOfficialLanguage: 'english',
      canadianWorkYears: 1,
    },
  };

  it('maps every answer onto the field the engine reads', () => {
    expect(toProfile(filled)).toStrictEqual({
      hasAccompanyingSpouse: true,
      age: 29,
      educationLevel: 'masters-or-professional',
      english: { reading: 9, writing: 9, listening: 9, speaking: 9 },
      french: { reading: 7, writing: 7, listening: 7, speaking: 7 },
      firstOfficialLanguage: 'english',
      canadianWorkYears: 3,
      foreignWorkYears: 2,
      hasCertificateOfQualification: false,
      siblingInCanada: true,
      canadianEducationCredential: 'three-years-or-more',
      provincialNomination: false,
      jobOfferTier: null,
      spouse: {
        educationLevel: 'bachelors-or-three-year',
        english: { reading: 8, writing: 8, listening: 8, speaking: 8 },
        french: null,
        firstOfficialLanguage: 'english',
        canadianWorkYears: 1,
      },
    });
  });

  /**
   * Arranged employment was removed on 25 March 2025 and crs-current awards it
   * nothing. No control offers it, so it must always reach the engine as null -
   * a form that grew a job-offer field would be a form scoring points that no
   * longer exist.
   */
  it('never supplies a job offer', () => {
    expect(toProfile(filled).jobOfferTier).toBeNull();
    expect(toProfile(emptyForm()).jobOfferTier).toBeNull();
  });

  it('drops spouse details when the spouse is not accompanying', () => {
    const notAccompanying = { ...filled, hasAccompanyingSpouse: false };
    expect(toProfile(notAccompanying).spouse).toBeNull();
  });

  /**
   * Declaring a spouse and filling nothing in is the worst of both columns:
   * core drops to the lower with-spouse scale and the spouse section pays
   * nothing back. score() has a warning that says exactly that, but only for a
   * null spouse - an object of nulls instead earns four ordinary "not answered"
   * warnings that never mention the points already lost.
   */
  it('reports a declared but undescribed spouse as no spouse details at all', () => {
    const declaredOnly = { ...emptyForm(), hasAccompanyingSpouse: true };
    expect(toProfile(declaredOnly).spouse).toBeNull();

    const warnings = score(toProfile(declaredOnly), crsCurrent).warnings;
    expect(warnings.some((warning) => warning.includes('with-spouse scale'))).toBe(true);
  });

  it('sends the details on as soon as any one of them is given', () => {
    const oneAnswer = {
      ...emptyForm(),
      hasAccompanyingSpouse: true,
      spouse: { ...emptySpouseForm(), canadianWorkYears: 1 },
    };
    expect(toProfile(oneAnswer).spouse).not.toBeNull();
  });

  it('counts a single language ability as a spouse detail, not as silence', () => {
    const oneAbility = {
      ...emptyForm(),
      hasAccompanyingSpouse: true,
      spouse: {
        ...emptySpouseForm(),
        english: { reading: 8, writing: null, listening: null, speaking: null },
      },
    };
    expect(hasAnySpouseDetail(oneAbility.spouse)).toBe(true);
    expect(toProfile(oneAbility).spouse).not.toBeNull();
  });

  /**
   * Unticking the box has to drop the spouse's details, not leave them scoring
   * in the background. Filling the spouse fields and then unticking must land
   * on exactly the score of someone who never filled them in.
   */
  it('scores the same whether or not spouse details were typed, once unticked', () => {
    const withDetails = { ...filled, hasAccompanyingSpouse: false };
    const withoutDetails = { ...withDetails, spouse: emptySpouseForm() };
    expect(score(toProfile(withDetails), crsCurrent).total)
      .toBe(score(toProfile(withoutDetails), crsCurrent).total);
  });

  it('produces a Profile the engine accepts, filled in as well as empty', () => {
    expect(() => profileSchema.parse(toProfile(filled))).not.toThrow();
  });
});
