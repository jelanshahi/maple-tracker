import { canadianEducationCredentials, educationLevels } from '@maple/crs-rules';
import { describe, expect, it } from 'vitest';
import {
  CANADIAN_EDUCATION_LABELS, CLB_LEVELS, EDUCATION_LABELS, OFFICIAL_LANGUAGE_LABELS, clbLabel, parseCount,
} from '../src/profile.ts';

describe('label maps', () => {
  it('names every education level crs-rules defines', () => {
    expect(Object.keys(EDUCATION_LABELS).sort()).toStrictEqual([...educationLevels].sort());
  });

  it('names every Canadian education credential crs-rules defines', () => {
    expect(Object.keys(CANADIAN_EDUCATION_LABELS).sort()).toStrictEqual([...canadianEducationCredentials].sort());
  });

  it('has no blank label, which would render as an empty option', () => {
    const labels = [
      ...Object.values(EDUCATION_LABELS),
      ...Object.values(CANADIAN_EDUCATION_LABELS),
      ...Object.values(OFFICIAL_LANGUAGE_LABELS),
    ];
    expect(labels.filter((label) => label.trim() === '')).toStrictEqual([]);
  });
});

describe('clbLabel', () => {
  it('covers 0 to 10, the range the criteria are written over', () => {
    expect([...CLB_LEVELS]).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('says 10 or higher at the top, because the top row is open-ended', () => {
    expect(clbLabel(10)).toBe('10 or higher');
  });

  it('renders every other level as its own number', () => {
    expect(clbLabel(0)).toBe('0');
    expect(clbLabel(7)).toBe('7');
    expect(clbLabel(9)).toBe('9');
  });
});

/**
 * ARCHITECTURE.md section 6: never infer. Anything that is not a whole
 * non-negative number is unsupplied, which scores zero and warns visibly -
 * rather than being coerced into a number the user never entered.
 */
describe('parseCount', () => {
  it('reads a whole number', () => {
    expect(parseCount('0')).toBe(0);
    expect(parseCount('5')).toBe(5);
    expect(parseCount('  32 ')).toBe(32);
  });

  it('treats a blank field as unsupplied rather than as zero', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount('   ')).toBeNull();
  });

  it('rejects a negative age or a negative number of years', () => {
    expect(parseCount('-1')).toBeNull();
  });

  it('rejects a fraction rather than rounding it into a different answer', () => {
    expect(parseCount('3.5')).toBeNull();
  });

  it('rejects text', () => {
    expect(parseCount('abc')).toBeNull();
  });
});
