import { describe, expect, it } from 'vitest';
import { parseDrawnAt, parseTieBreakAt } from '../src/dates.ts';

describe('parseDrawnAt', () => {
  it('combines the ISO date with the time of day', () => {
    expect(parseDrawnAt('2026-08-19', 'August 19th 2026 at 12:35:37 UTC'))
      .toBe('2026-08-19T12:35:37.000Z');
  });

  // Every drawDateTime shape observed across the 438 published rounds. The date
  // half is ignored on purpose, so all of these reduce to the same problem.
  it.each([
    ['2026-08-18', 'August 18, 2026 at 10:13:44 UTC',            '2026-08-18T10:13:44.000Z'],
    ['2025-10-15', 'October 15, 2025 15:55:18 UTC',              '2025-10-15T15:55:18.000Z'],
    ['2025-01-23', 'January 23, 2025 at 2025-01-23 15:30:04 UTC','2025-01-23T15:30:04.000Z'],
    ['2024-05-31', 'May 31, 2024 at12:48:30 UTC',                '2024-05-31T12:48:30.000Z'],
    ['2023-10-25', 'October 25, 2023 at 15:48:39 AM UTC',        '2023-10-25T15:48:39.000Z'],
    ['2023-04-26', 'April 26,2023 18:10:04 UTC',                 '2023-04-26T18:10:04.000Z'],
    ['2023-03-01', 'March 01, 2023, at 17:24:39 UTC',            '2023-03-01T17:24:39.000Z'],
    ['2022-02-02', 'February 02 2022 at 14:16:27 UTC',           '2022-02-02T14:16:27.000Z'],
    ['2016-07-13', ' July 13, 2016 at 13:56:45 UTC',             '2016-07-13T13:56:45.000Z'],
    ['2015-03-27', 'March 27, 2015 at 23:59:47',                 '2015-03-27T23:59:47.000Z'],
  ])('reads %s / %s', (drawDate, drawDateTime, expected) => {
    expect(parseDrawnAt(drawDate, drawDateTime)).toBe(expected);
  });

  it('returns null when the date is not ISO, rather than guessing', () => {
    expect(parseDrawnAt('August 19, 2026', 'August 19, 2026 at 12:35:37 UTC')).toBeNull();
  });

  it('returns null when no time of day can be found', () => {
    expect(parseDrawnAt('2026-08-19', 'August 19, 2026')).toBeNull();
  });

  it('rejects a date that does not exist', () => {
    expect(parseDrawnAt('2025-02-30', 'x 00:00:00')).toBeNull();
  });
});

describe('parseTieBreakAt', () => {
  // Every drawCutOff shape observed across the 438 published rounds.
  it.each([
    ['March 1, 2026 at 18:34:05 UTC',        '2026-03-01T18:34:05.000Z'],
    ['July 3rd 2026 at 21:35:13 UTC',        '2026-07-03T21:35:13.000Z'],
    ['May 21, 2026 at  12:14:09 UTC',        '2026-05-21T12:14:09.000Z'],
    ['April 13, 2026  at 23:10:05 UTC',      '2026-04-13T23:10:05.000Z'],
    ['March 05, 2025 at 05:10:48',           '2025-03-05T05:10:48.000Z'],
    ['May 26 2025 at 12:28:38 UTC',          '2025-05-26T12:28:38.000Z'],
    ['March 02. 2024 at 01:58:34 UTC',       '2024-03-02T01:58:34.000Z'],
    ['September 30, 2023 at 04:22:17 AM UTC','2023-09-30T04:22:17.000Z'],
    ['July 04, 2023 at 19:36:18 UTC ',       '2023-07-04T19:36:18.000Z'],
    ['June 19, 2023 06:41:05 UTC',           '2023-06-19T06:41:05.000Z'],
    ['May 19,2022 06:48:41 UTC',             '2022-05-19T06:48:41.000Z'],
    ['December 12, 2022, at 10:48:12 UTC',   '2022-12-12T10:48:12.000Z'],
    [' January 17, 2018 at 12:33:00 UTC',    '2018-01-17T12:33:00.000Z'],
  ])('reads %s', (raw, expected) => {
    expect(parseTieBreakAt(raw)).toBe(expected);
  });

  it('returns null for the 76 rounds that publish an empty tie-break', () => {
    expect(parseTieBreakAt('')).toBeNull();
    expect(parseTieBreakAt('   ')).toBeNull();
  });

  it('returns null when the year is missing rather than inferring it', () => {
    // Round 208 publishes exactly this. Guessing the year would invent the
    // fact that decides who was invited at the cut-off.
    expect(parseTieBreakAt('October 7 at 16:38:21 UTC')).toBeNull();
  });

  it('returns null for an unrecognised month', () => {
    expect(parseTieBreakAt('Smarch 7, 2023 at 16:38:21 UTC')).toBeNull();
  });
});

describe('parseDrawnAt where drawDate and drawDateTime disagree', () => {
  // Round 139. 02:04 UTC on the 19th is 22:04 Eastern on the 18th, so both
  // fields are right and the precise UTC instant is the one to keep. IRCC
  // publishes this round's tie-break as the identical string, so preferring
  // drawDate here would put the round a day before its own tie-break.
  it('keeps the UTC instant when the two are within a day', () => {
    expect(parseDrawnAt('2020-03-18', 'March 19, 2020 at 02:04:06 UTC'))
      .toBe('2020-03-19T02:04:06.000Z');
  });

  // Ten days apart is not a timezone, it is a typo in the free text.
  it('falls back to the ISO date when the two are more than a day apart', () => {
    expect(parseDrawnAt('2025-07-22', 'July 12, 2025 at 16:27:45 UTC'))
      .toBe('2025-07-22T16:27:45.000Z');
  });

  it('still reads the doubled-date round from the ISO date', () => {
    expect(parseDrawnAt('2025-01-23', 'January 23, 2025 at 2025-01-23 15:30:04 UTC'))
      .toBe('2025-01-23T15:30:04.000Z');
  });
});
