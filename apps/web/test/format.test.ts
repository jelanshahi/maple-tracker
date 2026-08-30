import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_HOURS,
  describeRoundType,
  formatChange,
  formatDate,
  formatDateTime,
  formatInteger,
  hoursBetween,
  isStale,
  streamLabel,
} from '../src/format.ts';

describe('timestamp parsing', () => {
  // Postgres and PostgREST do not agree on how to render a timestamptz, and the
  // two-digit-offset form is invalid ISO that new Date() rejects outright.
  it.each([
    ['2026-08-19T12:35:37+00:00', 'full ISO'],
    ['2026-08-19 12:35:37+00', 'Postgres space and short offset'],
    ['2026-08-19T12:35:37Z', 'Zulu'],
    ['2026-08-19 12:35:37.123456+00', 'microsecond precision'],
  ])('reads %s (%s)', (timestamp) => {
    expect(formatDate(timestamp)).toBe('August 19, 2026');
  });

  it('throws rather than rendering Invalid Date', () => {
    expect(() => formatDate('not a timestamp')).toThrow(/unparseable timestamp/);
  });

  it('respects a non-UTC offset instead of dropping it', () => {
    // 2026-08-19T23:30:00-05:00 is 04:30 UTC the following day.
    expect(formatDate('2026-08-19T23:30:00-05:00')).toBe('August 20, 2026');
  });
});

describe('formatDateTime', () => {
  it('labels the timezone, because an unlabelled tie-break time misleads', () => {
    expect(formatDateTime('2026-08-19T12:35:37+00:00')).toBe('August 19, 2026, 12:35 UTC');
  });
});

describe('isStale', () => {
  const now = new Date('2026-08-28T12:00:00Z');

  it('treats an unknown verification time as stale', () => {
    // Unproven freshness must never be presented as freshness.
    expect(isStale(null, now)).toBe(true);
  });

  it('is fresh exactly on the threshold', () => {
    expect(isStale('2026-08-27T12:00:00Z', now)).toBe(false);
    expect(hoursBetween('2026-08-27T12:00:00Z', now)).toBe(STALE_AFTER_HOURS);
  });

  it('is stale just past the threshold', () => {
    expect(isStale('2026-08-27T11:59:00Z', now)).toBe(true);
  });

  it('is fresh for a recent check', () => {
    expect(isStale('2026-08-28T09:00:00Z', now)).toBe(false);
  });
});

describe('formatChange', () => {
  it('signs a rise and a fall, and names the two absent cases', () => {
    expect(formatChange(9)).toBe('+9');
    expect(formatChange(-11)).toBe('-11');
    expect(formatChange(0)).toBe('no change');
    expect(formatChange(null)).toBe('no earlier round');
  });
});

describe('formatInteger', () => {
  it('groups thousands', () => {
    expect(formatInteger(5000)).toBe('5,000');
    expect(formatInteger(27332)).toBe('27,332');
  });
});

describe('describeRoundType', () => {
  it('prefers the category label when there is one', () => {
    expect(describeRoundType('category', 'French-language proficiency')).toBe('French-language proficiency');
  });

  it('names the two uncategorised round types', () => {
    expect(describeRoundType('general', null)).toBe('General (all programs)');
    expect(describeRoundType('program', null)).toBe('Program-specific');
  });

  it('renders a program label the same way it renders a category label', () => {
    expect(describeRoundType('program', 'Canadian Experience Class')).toBe('Canadian Experience Class');
  });
});

describe('streamLabel', () => {
  // Categories and programs share one map because their code spaces are
  // disjoint - the ten seeded category codes are words like 'french' and
  // 'stem', the four program codes are 'cec', 'pnp', 'fst', 'fsw'. This is the
  // same merged map buildLadder already builds.
  const labels = new Map([
    ['french', 'French-language proficiency'],
    ['cec', 'Canadian Experience Class'],
    ['pnp', 'Provincial Nominee Program'],
  ]);

  it('names the category when a round has one', () => {
    expect(streamLabel({ category_code: 'french', program_code: null }, labels))
      .toBe('French-language proficiency');
  });

  it('names the specific program rather than the generic round type', () => {
    // The whole point of the program_code split: round 436 is a Canadian
    // Experience Class draw, not an anonymous 'Program-specific' one.
    expect(streamLabel({ category_code: null, program_code: 'cec' }, labels))
      .toBe('Canadian Experience Class');
  });

  it('has no label for a round that names neither', () => {
    // Null lets describeRoundType supply "General (all programs)" instead.
    expect(streamLabel({ category_code: null, program_code: null }, labels)).toBeNull();
  });

  it('renders an unseeded code as itself rather than inventing a label', () => {
    expect(streamLabel({ category_code: 'brand-new-stream', program_code: null }, labels))
      .toBe('brand-new-stream');
    expect(streamLabel({ category_code: null, program_code: 'brand-new-program' }, labels))
      .toBe('brand-new-program');
  });

  it('prefers the category when a row somehow carries both', () => {
    // program_iff_program_round makes this unreachable in the database, but a
    // guess here would be a silent one, so the precedence is stated and tested.
    expect(streamLabel({ category_code: 'french', program_code: 'cec' }, labels))
      .toBe('French-language proficiency');
  });
});
