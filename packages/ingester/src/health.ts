/**
 * Health checks. Pure - they take data and a reference time and return results.
 *
 * The failure to design against is not downtime, it is silent staleness. A
 * tracker showing three-week-old data as though it were current is worse than
 * one that is visibly down, so every one of these is loud.
 */

export type HealthCheck = { name: string; ok: boolean; detail: string };

export type HealthInput = {
  /** Rows parsed from a body that changed. Null when the body was unchanged. */
  parsedRowCount: number | null;
  lastSuccessfulRunAt: string | null;
  latestDrawnAt: string | null;
  unresolvedQuarantineCount: number;
};

/**
 * How long without a successful fetch before something is wrong.
 *
 * ARCHITECTURE.md section 5 proposes 6 hours, but the target cadence is
 * 08:00-20:00 ET on weekdays. A fixed 6 hours therefore fails every night and
 * all weekend by design, which trains everyone to ignore it. It is a parameter
 * so it can be set to match whatever cadence is actually deployed; the default
 * spans a weekend plus a margin.
 */
export const DEFAULT_FETCH_STALE_AFTER_HOURS = 72;

/** IRCC pauses rounds over holidays, so this is deliberately generous. */
export const DEFAULT_DRAW_STALE_AFTER_DAYS = 21;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function runHealthChecks(
  input: HealthInput,
  now: Date,
  options: { fetchStaleAfterHours?: number; drawStaleAfterDays?: number } = {},
): HealthCheck[] {
  const fetchWindowMs = (options.fetchStaleAfterHours ?? DEFAULT_FETCH_STALE_AFTER_HOURS) * HOUR_MS;
  const drawWindowMs = (options.drawStaleAfterDays ?? DEFAULT_DRAW_STALE_AFTER_DAYS) * DAY_MS;

  return [
    parseProducedRows(input.parsedRowCount),
    fetchRecent(input.lastSuccessfulRunAt, now, fetchWindowMs),
    drawRecent(input.latestDrawnAt, now, drawWindowMs),
    nothingQuarantined(input.unresolvedQuarantineCount),
  ];
}

/** Zero rows from a changed body is a failure, not an empty result. */
function parseProducedRows(parsedRowCount: number | null): HealthCheck {
  if (parsedRowCount === null) {
    return { name: 'parseProducedRows', ok: true, detail: 'body unchanged; nothing to parse' };
  }
  return {
    name: 'parseProducedRows',
    ok: parsedRowCount > 0,
    detail: `${parsedRowCount} rows parsed from a changed body`,
  };
}

function fetchRecent(lastSuccessfulRunAt: string | null, now: Date, windowMs: number): HealthCheck {
  if (lastSuccessfulRunAt === null) {
    return { name: 'fetchRecent', ok: false, detail: 'no successful run on record' };
  }
  const age = now.getTime() - Date.parse(lastSuccessfulRunAt);
  return {
    name: 'fetchRecent',
    ok: age <= windowMs,
    detail: `last successful run ${Math.round(age / HOUR_MS)}h ago`,
  };
}

/**
 * Catches what the others miss: IRCC paused rounds, or the parser is quietly
 * returning a structure that is empty but valid.
 */
function drawRecent(latestDrawnAt: string | null, now: Date, windowMs: number): HealthCheck {
  if (latestDrawnAt === null) {
    return { name: 'drawRecent', ok: false, detail: 'no rounds stored' };
  }
  const age = now.getTime() - Date.parse(latestDrawnAt);
  return {
    name: 'drawRecent',
    ok: age <= windowMs,
    detail: `most recent round ${Math.round(age / DAY_MS)} days ago`,
  };
}

function nothingQuarantined(unresolved: number): HealthCheck {
  return {
    name: 'nothingQuarantined',
    ok: unresolved === 0,
    detail: `${unresolved} unresolved quarantined rows`,
  };
}
