import { describe, expect, it } from 'vitest';
import { runHealthChecks } from '../src/health.ts';

const NOW = new Date('2026-08-23T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const healthy = {
  parsedRowCount: 438,
  lastSuccessfulRunAt: hoursAgo(1),
  latestDrawnAt: daysAgo(2),
  unresolvedQuarantineCount: 0,
};

const check = (input: Parameters<typeof runHealthChecks>[0], name: string) => {
  const found = runHealthChecks(input, NOW).find((c) => c.name === name);
  if (found === undefined) throw new Error(`no check named ${name}`);
  return found;
};

describe('runHealthChecks', () => {
  it('passes every check on healthy data', () => {
    expect(runHealthChecks(healthy, NOW).every((c) => c.ok)).toBe(true);
  });

  it('fails parseProducedRows when a changed body yielded nothing', () => {
    expect(check({ ...healthy, parsedRowCount: 0 }, 'parseProducedRows').ok).toBe(false);
  });

  it('passes parseProducedRows when the body was unchanged', () => {
    expect(check({ ...healthy, parsedRowCount: null }, 'parseProducedRows').ok).toBe(true);
  });

  it('fails fetchRecent when no run has ever succeeded', () => {
    expect(check({ ...healthy, lastSuccessfulRunAt: null }, 'fetchRecent').ok).toBe(false);
  });

  // The reason the window is a parameter rather than a hardcoded 6 hours: the
  // target cadence is weekdays only, so a 6-hour window fails every weekend.
  it('does not fail fetchRecent across a normal weekend', () => {
    const overWeekend = { ...healthy, lastSuccessfulRunAt: hoursAgo(60) };
    expect(check(overWeekend, 'fetchRecent').ok).toBe(true);
    expect(runHealthChecks(overWeekend, NOW, { fetchStaleAfterHours: 6 })
      .find((c) => c.name === 'fetchRecent')?.ok).toBe(false);
  });

  it('fails drawRecent when no round has landed in 21 days', () => {
    expect(check({ ...healthy, latestDrawnAt: daysAgo(22) }, 'drawRecent').ok).toBe(false);
    expect(check({ ...healthy, latestDrawnAt: daysAgo(20) }, 'drawRecent').ok).toBe(true);
  });

  it('fails drawRecent when nothing is stored at all', () => {
    expect(check({ ...healthy, latestDrawnAt: null }, 'drawRecent').ok).toBe(false);
  });

  it('fails nothingQuarantined while rows are unresolved', () => {
    expect(check({ ...healthy, unresolvedQuarantineCount: 1 }, 'nothingQuarantined').ok).toBe(false);
  });
});
