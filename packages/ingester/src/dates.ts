/**
 * Date handling for IRCC's rounds payload.
 *
 * Split out of parse.ts because it is a genuinely separate responsibility and
 * the parsing rules below need room to be explained.
 *
 * IRCC publishes each round's timestamp as free text, and it is not
 * machine-readable: across the 438 published rounds there are 11 distinct
 * formats in `drawDateTime` and 15 in `drawCutOff`, including an ordinal
 * ("August 19th 2026"), a doubled date ("January 23, 2025 at 2025-01-23
 * 15:30:04 UTC"), a 24-hour time labelled AM ("15:48:39 AM"), a missing space
 * ("at12:48:30"), a full stop for a comma ("March 02. 2024"), and one value with
 * no year at all. `new Date()` fails on 418 of the 438.
 *
 * `drawDate`, by contrast, is a clean ISO yyyy-mm-dd in every single round, so
 * it serves as both a fallback and a sanity check.
 *
 * `drawCutOff` has no clean companion field, so it has to be parsed in full.
 */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_OF_DAY = /(\d{1,2}):(\d{2}):(\d{2})/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "March 02. 2024 at 01:58:34 UTC " -> "march 02 2024 at 01:58:34 utc"
 * Punctuation becomes whitespace and runs of whitespace collapse, which is what
 * makes one regex able to read every observed variant.
 */
function normaliseWhitespace(text: string): string {
  return text.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Assemble a UTC instant, rejecting dates that do not exist (e.g. 31 February). */
function toUtcIso(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;
  return roundTrips ? date.toISOString() : null;
}

/** Read a whole timestamp out of IRCC's free text. Null when it cannot be read. */
function parseFreeTextTimestamp(text: string): string | null {
  const cleaned = normaliseWhitespace(text);
  if (cleaned === '') return null;

  // month, day (possibly ordinal), 4-digit year, optional "at", then hh:mm:ss.
  const match = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)? (\d{4}) (?:at )?(\d{1,2}):(\d{2}):(\d{2})/.exec(cleaned);
  if (match === null) return null;

  const monthIndex = MONTHS.indexOf(match[1] ?? '');
  if (monthIndex < 0) return null;

  return toUtcIso(
    Number(match[3]), monthIndex + 1, Number(match[2]),
    Number(match[4]), Number(match[5]), Number(match[6]),
  );
}

/** `drawDate`'s ISO date combined with the time of day lifted out of the free text. */
function fromIsoDatePlusTime(isoDate: RegExpExecArray, drawDateTime: string): string | null {
  const time = TIME_OF_DAY.exec(drawDateTime);
  if (time === null) return null;
  return toUtcIso(
    Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]),
    Number(time[1]), Number(time[2]), Number(time[3]),
  );
}

/**
 * Build the round's UTC instant.
 *
 * `drawDateTime` is preferred, because it is the only field stating an actual
 * instant and ARCHITECTURE.md section 7 requires UTC to be stored. It is
 * cross-checked against `drawDate`, because the two disagree on 11 rounds:
 *
 *   - Up to a day apart is the Ottawa timezone boundary, not an error. Round 139
 *     has drawDate 2020-03-18 and drawDateTime 02:04:06 UTC on the 19th, which
 *     is 22:04 the previous evening in Eastern Time. The precise UTC instant
 *     wins. Taking the date from `drawDate` instead would place the round a day
 *     before its own tie-break, which IRCC publishes as the very same string.
 *
 *   - More than a day apart is a mistake in the free text - one round is off by
 *     ten days - so the clean ISO `drawDate` wins and only the time of day is
 *     lifted out of `drawDateTime`.
 *
 * A `drawDate` that is not ISO returns null rather than falling back: it is
 * clean in all 438 published rounds, so a malformed one means something changed
 * and a human needs to look.
 */
export function parseDrawnAt(drawDate: string, drawDateTime: string): string | null {
  const isoDate = ISO_DATE.exec(drawDate.trim());
  if (isoDate === null) return null;

  const fromText = parseFreeTextTimestamp(drawDateTime);
  const fromIsoDate = fromIsoDatePlusTime(isoDate, drawDateTime);

  if (fromText !== null && fromIsoDate !== null) {
    const drift = Math.abs(Date.parse(fromText) - Date.parse(fromIsoDate));
    return drift <= ONE_DAY_MS ? fromText : fromIsoDate;
  }
  return fromText ?? fromIsoDate;
}

/**
 * Parse a tie-break timestamp.
 *
 * Returns null for the 76 rounds that publish an empty string, and for the one
 * that omits the year entirely ("October 7 at 16:38:21 UTC"). A missing year is
 * left null rather than inferred from the draw date: tie_break_at is nullable,
 * and a guessed tie-break is worse than an absent one, because it decides who
 * was invited at the cut-off.
 *
 * Values with no UTC marker are read as UTC, which is what every other round
 * states explicitly and what ARCHITECTURE.md section 7 requires.
 */
export function parseTieBreakAt(drawCutOff: string): string | null {
  return parseFreeTextTimestamp(drawCutOff);
}
