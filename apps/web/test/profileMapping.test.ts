/**
 * Round-tripping a profile through the form.
 *
 * A saved profile is loaded back into the form and scored again, so toForm and
 * toProfile have to agree. If they drift, somebody's saved answers come back
 * subtly different and score differently, which is the worst kind of bug this
 * app could have - silent, personal, and about immigration.
 */
import { crsCurrent, profileSchema, score } from '@maple/crs-rules';
import type { Profile } from '@maple/crs-rules';
import { describe, expect, it } from 'vitest';
import { emptyForm } from '../src/profileForm.ts';
import { toForm, toProfile } from '../src/profileMapping.ts';

const clb = (level: number) => ({ reading: level, writing: level, listening: level, speaking: level });

const single: Profile = {
  hasAccompanyingSpouse: false,
  age: 29,
  educationLevel: 'bachelors-or-three-year',
  english: clb(9),
  french: null,
  firstOfficialLanguage: 'english',
  canadianWorkYears: 0,
  foreignWorkYears: 0,
  hasCertificateOfQualification: false,
  siblingInCanada: false,
  canadianEducationCredential: 'none',
  provincialNomination: false,
  jobOfferTier: null,
  spouse: null,
};

const withSpouse: Profile = {
  ...single,
  hasAccompanyingSpouse: true,
  french: { reading: 9, writing: 8, listening: 9, speaking: 7 },
  spouse: {
    educationLevel: 'masters-or-professional',
    english: clb(8),
    french: null,
    firstOfficialLanguage: 'english',
    canadianWorkYears: 2,
  },
};

const profiles = { single, withSpouse, empty: toProfile(emptyForm()) };

describe.each(Object.entries(profiles))('%s', (_name, profile) => {
  it('survives a round trip through the form unchanged', () => {
    expect(toProfile(toForm(profile))).toStrictEqual(profile);
  });

  it('scores the same after a round trip', () => {
    expect(score(toProfile(toForm(profile)), crsCurrent).total).toBe(score(profile, crsCurrent).total);
  });

  it('still parses as a Profile', () => {
    expect(() => profileSchema.parse(toProfile(toForm(profile)))).not.toThrow();
  });
});

describe('toForm', () => {
  it('keeps uneven abilities apart, which is the whole reason the engine takes four', () => {
    const uneven = toForm(withSpouse).french;
    expect(uneven).toStrictEqual({ reading: 9, writing: 8, listening: 9, speaking: 7 });
  });

  it('turns an unsupplied test into a blank set of four rather than dropping it', () => {
    expect(toForm(single).french).toStrictEqual({ reading: null, writing: null, listening: null, speaking: null });
  });

  /**
   * A saved profile with no spouse still needs spouse fields to exist, blank,
   * in case the user ticks the box after loading it.
   */
  it('gives a profile with no spouse an empty spouse form', () => {
    expect(toForm(single).spouse).toStrictEqual(emptyForm().spouse);
  });

  it('restores the spouse details when there are some', () => {
    expect(toForm(withSpouse).spouse.canadianWorkYears).toBe(2);
    expect(toForm(withSpouse).spouse.educationLevel).toBe('masters-or-professional');
  });

  /**
   * The form has no job-offer control, because arranged employment was removed
   * on 25 March 2025 and crs-current awards it nothing. A stored profile that
   * somehow carries one must not resurrect it on the way back in.
   */
  it('drops a job offer rather than carrying one back into the form', () => {
    const withOffer: Profile = { ...single, jobOfferTier: 'noc-00' };
    expect(toProfile(toForm(withOffer)).jobOfferTier).toBeNull();
  });
});
