/**
 * Presentation helpers. Pure - the caller passes `now`, so the staleness rule is
 * testable by moving the clock rather than by waiting a day.
 *
 * Times render in UTC and say so. ARCHITECTURE.md section 7 asks for device
 * local time, and that is not honestly achievable here: pages are server
 * rendered and cached by ISR, so the server neither knows nor may bake in any
 * one viewer's timezone. A tie-break timestamp decides who was invited and who
 * was not, which makes a wrongly-localised one worse than a plainly labelled
 * UTC one. Localising in the browser needs a client component; it belongs with
 * step 4, not here.
 */

/** ARCHITECTURE.md section 5: over this, the UI says so. */
export const STALE_AFTER_HOURS = 24;

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const TIME_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Postgres renders timestamptz as "2026-08-19 12:35:37+00": a space where ISO
 * wants a T, and a two-digit offset that `new Date` rejects outright as invalid
 * rather than tolerating. PostgREST normally sends full ISO, but accepting both
 * costs one regex and removes an entire class of "Invalid Date" bug.
 *
 * An unparseable timestamp throws rather than rendering "Invalid Date" onto a
 * page about somebody's immigration prospects.
 */
function toDate(timestamp: string): Date {
  const iso = timestamp.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`unparseable timestamp: ${timestamp}`);
  return date;
}

export function formatDate(timestamp: string): string {
  return DATE_FORMAT.format(toDate(timestamp));
}

export function formatDateTime(timestamp: string): string {
  const date = toDate(timestamp);
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)} UTC`;
}

export function hoursBetween(timestamp: string, now: Date): number {
  return (now.getTime() - toDate(timestamp).getTime()) / 3_600_000;
}

/**
 * Null means we could not determine when the data was last checked. That counts
 * as stale: unproven freshness must never be presented as freshness.
 */
export function isStale(lastVerified: string | null, now: Date): boolean {
  if (lastVerified === null) return true;
  return hoursBetween(lastVerified, now) > STALE_AFTER_HOURS;
}

export function formatInteger(value: number): string {
  return value.toLocaleString('en-CA');
}

/** Movement in the cut-off since the previous round of the same stream. */
export function formatChange(change: number | null): string {
  if (change === null) return 'no earlier round';
  if (change === 0) return 'no change';
  return change > 0 ? `+${formatInteger(change)}` : formatInteger(change);
}

/**
 * Category and program labels in one map, because a round names at most one of
 * the two and every caller looks a code up without caring which it was.
 *
 * Categories are applied last so a category wins a code collision, matching
 * streamLabel's precedence below. The two code spaces are disjoint today -
 * category codes are words like 'french' and 'stem', program codes are 'cec',
 * 'pnp', 'fst', 'fsw' - so this decides nothing yet; it exists so the map and
 * the lookup cannot disagree if that ever changes.
 */
export function mergeStreamLabels(
  categories: readonly { code: string; label: string }[],
  programs: readonly { code: string; label: string }[],
): ReadonlyMap<string, string> {
  return new Map([
    ...programs.map((program) => [program.code, program.label] as const),
    ...categories.map((category) => [category.code, category.label] as const),
  ]);
}

/**
 * The human name for the stream a round belongs to, or null when it names
 * neither a category nor a program and only its round type is left to describe
 * it.
 *
 * Categories and programs are looked up in one map because their code spaces
 * are disjoint, which is the same assumption buildLadder already makes when it
 * merges them. An unseeded code renders as itself: IRCC adds streams faster
 * than the seed migrations do, and inventing a label would be inventing a fact.
 */
export function streamLabel(
  round: { category_code: string | null; program_code: string | null },
  labels: ReadonlyMap<string, string>,
): string | null {
  const code = round.category_code ?? round.program_code;
  if (code === null) return null;
  return labels.get(code) ?? code;
}

/**
 * What to call a round that names neither a category nor a program, keyed by
 * round type. Shared with the ladder so /categories and /rounds cannot end up
 * calling the same rounds two different things.
 *
 * 'program' says "uncategorised" rather than just "Program-specific" because
 * such a row means the program_code backfill has not reached it: the honest
 * reading is "we do not know which program", not "this program has no name".
 */
export const UNCATEGORISED_LABELS: Record<string, string> = {
  general: 'General (all programs)',
  program: 'Program-specific (uncategorised)',
};

/** An unknown round type renders as itself rather than as a guess. */
export function describeRoundType(roundType: string, label: string | null): string {
  if (label !== null) return label;
  return UNCATEGORISED_LABELS[roundType] ?? roundType;
}
