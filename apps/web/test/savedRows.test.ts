/**
 * The stored profile is validated on the way out, not just on the way in.
 *
 * saved_profiles.profile is a jsonb column and holds whatever was written to
 * it: a row from an older version of this app, or one whose shape a migration
 * changed underneath. It has to fail loudly here rather than reach score()
 * half-formed and quietly cost somebody points.
 */
import { describe, expect, it } from 'vitest';
import { assessmentSchema, savedProfileSchema } from '../src/rows.ts';

const validProfile = {
  hasAccompanyingSpouse: false,
  age: 29,
  educationLevel: 'bachelors-or-three-year',
  english: { reading: 9, writing: 9, listening: 9, speaking: 9 },
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

describe('savedProfileSchema', () => {
  it('accepts a row this app wrote', () => {
    const row = { profile: validProfile, updated_at: '2026-08-30T21:14:00Z' };
    expect(savedProfileSchema.parse(row).profile.age).toBe(29);
  });

  it('rejects a profile missing a field the engine reads', () => {
    const { educationLevel: _dropped, ...incomplete } = validProfile;
    expect(() => savedProfileSchema.parse({ profile: incomplete, updated_at: '2026-08-30T21:14:00Z' }))
      .toThrow();
  });

  it('rejects an education level the rule sets do not define', () => {
    const row = { profile: { ...validProfile, educationLevel: 'honorary-doctorate' }, updated_at: '2026-08-30T21:14:00Z' };
    expect(() => savedProfileSchema.parse(row)).toThrow();
  });

  it('rejects a language test that is missing an ability', () => {
    const row = {
      profile: { ...validProfile, english: { reading: 9, writing: 9, listening: 9 } },
      updated_at: '2026-08-30T21:14:00Z',
    };
    expect(() => savedProfileSchema.parse(row)).toThrow();
  });

  it('rejects an empty column rather than treating it as an empty profile', () => {
    expect(() => savedProfileSchema.parse({ profile: null, updated_at: '2026-08-30T21:14:00Z' })).toThrow();
  });
});

describe('assessmentSchema', () => {
  it('accepts a recorded estimate', () => {
    const row = { id: 7, total: 478, rule_set_id: 'crs-current', created_at: '2026-08-30T21:14:00Z' };
    expect(assessmentSchema.parse(row)).toStrictEqual(row);
  });

  /**
   * Deliberately no profile column. assessments record the total and the rule
   * set that produced it, never a copy of the answers - see the migration.
   */
  it('carries no profile', () => {
    expect(Object.keys(assessmentSchema.shape)).toStrictEqual(['id', 'total', 'rule_set_id', 'created_at']);
  });

  it('rejects a non-integer score', () => {
    expect(() => assessmentSchema.parse({ id: 1, total: 478.5, rule_set_id: 'crs-current', created_at: 'x' }))
      .toThrow();
  });
});
