import { describe, expect, it } from 'vitest';
import { classifyRound } from '../src/categories.ts';

describe('classifyRound', () => {
  it.each([
    ['No Program Specified',       'general', null],
    ['General',                    'general', null],
    ['Canadian Experience Class',  'program', 'cec'],
    ['Provincial Nominee Program', 'program', 'pnp'],
    ['Federal Skilled Worker',     'program', 'fsw'],
    ['Federal Skilled Trades',     'program', 'fst'],
  ])('classifies %s as a %s round with program code %s', (drawName, roundType, programCode) => {
    expect(classifyRound(drawName)).toEqual({ roundType, categoryCode: null, programCode });
  });

  // "Federal Skilled Trades" contains "trade". It must not fall through to the
  // trades category probe.
  it('does not mistake the Federal Skilled Trades program for the trades category', () => {
    expect(classifyRound('Federal Skilled Trades')?.categoryCode).toBeNull();
  });

  // Every category name IRCC has published, mapped onto the ten seeded codes.
  it.each([
    ['French language proficiency (Version 1)',                    'french'],
    ['French-Language proficiency 2026-Version 2',                 'french'],
    ['Healthcare occupations (Version 1)',                         'healthcare'],
    ['Healthcare and social services occupations (Version 2)',     'healthcare'],
    ['Healthcare and Social Services Occupations, 2026-Version 3', 'healthcare'],
    ['STEM occupations (Version 1)',                               'stem'],
    ['Trade occupations (Version 1)',                              'trades'],
    ['Trade occupations (Version 2)',                              'trades'],
    ['Trades Occupations, 2026-Version 3',                         'trades'],
    ['Transport occupations (Version 1)',                          'transport'],
    ['Transport Occupations, 2026-Version 2',                      'transport'],
    ['Agriculture and agri-food occupations (Version 1)',          'agriculture'],
    ['Education occupations (Version 1)',                          'education'],
    ['Physicians with Canadian Work Experience, 2026-Version 1',   'physicians'],
    ['Senior managers with Canadian Work Experience, 2026-Version 1', 'senior-managers'],
    ['Skilled Military Recruits, 2026-Version 1',                  'military'],
  ])('maps %s to the %s category', (drawName, categoryCode) => {
    expect(classifyRound(drawName)).toEqual({ roundType: 'category', categoryCode, programCode: null });
  });

  it('returns null for an unknown stream so the row is quarantined, not guessed', () => {
    expect(classifyRound('Underwater Basket Weaving occupations (Version 1)')).toBeNull();
  });
});
