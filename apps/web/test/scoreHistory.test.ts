import { describe, expect, it } from 'vitest';
import type { Assessment } from '../src/rows.ts';
import { buildHistory } from '../src/scoreHistory.ts';

function assessment(over: Partial<Assessment> & Pick<Assessment, 'id' | 'total' | 'created_at'>): Assessment {
  return { rule_set_id: 'crs-current', ...over };
}

describe('buildHistory', () => {
  it('returns nothing for an account that has saved nothing', () => {
    expect(buildHistory([])).toStrictEqual([]);
  });

  it('gives the first save no change to report', () => {
    const history = buildHistory([assessment({ id: 1, total: 466, created_at: '2026-07-14T09:00:00Z' })]);
    expect(history).toStrictEqual([
      { id: 1, total: 466, ruleSetId: 'crs-current', createdAt: '2026-07-14T09:00:00Z', change: null },
    ]);
  });

  it('lists newest first', () => {
    const history = buildHistory([
      assessment({ id: 1, total: 466, created_at: '2026-07-14T09:00:00Z' }),
      assessment({ id: 3, total: 478, created_at: '2026-08-30T09:00:00Z' }),
      assessment({ id: 2, total: 466, created_at: '2026-08-02T09:00:00Z' }),
    ]);
    expect(history.map((entry) => entry.id)).toStrictEqual([3, 2, 1]);
  });

  it('measures each save against the one before it in time, not the row above it', () => {
    // Deliberately handed to it out of order, as a query with a different sort
    // would. buildLadder sorts defensively for the same reason.
    const history = buildHistory([
      assessment({ id: 3, total: 478, created_at: '2026-08-30T09:00:00Z' }),
      assessment({ id: 1, total: 466, created_at: '2026-07-14T09:00:00Z' }),
      assessment({ id: 2, total: 470, created_at: '2026-08-02T09:00:00Z' }),
    ]);
    expect(history.map((entry) => [entry.id, entry.change])).toStrictEqual([
      [3, 8],
      [2, 4],
      [1, null],
    ]);
  });

  it('reports a drop as a negative number', () => {
    const history = buildHistory([
      assessment({ id: 1, total: 500, created_at: '2026-07-14T09:00:00Z' }),
      assessment({ id: 2, total: 478, created_at: '2026-08-02T09:00:00Z' }),
    ]);
    expect(history[0]?.change).toBe(-22);
  });

  it('reports an unchanged score as zero rather than as nothing', () => {
    const history = buildHistory([
      assessment({ id: 1, total: 478, created_at: '2026-07-14T09:00:00Z' }),
      assessment({ id: 2, total: 478, created_at: '2026-08-02T09:00:00Z' }),
    ]);
    expect(history[0]?.change).toBe(0);
  });

  /**
   * ARCHITECTURE.md section 7.5: never present a comparison that is not like
   * for like. A total scored under one rule set and one scored under another
   * measure different things, and differencing them would describe a rule
   * change as if the person had changed.
   */
  it('withholds the change across a rule-set boundary', () => {
    const history = buildHistory([
      assessment({ id: 1, total: 520, created_at: '2026-07-14T09:00:00Z', rule_set_id: 'crs-2024' }),
      assessment({ id: 2, total: 478, created_at: '2026-08-02T09:00:00Z', rule_set_id: 'crs-current' }),
    ]);
    expect(history[0]?.change).toBeNull();
  });

  it('orders two saves in the same second by id, so the movement cannot flip between renders', () => {
    const history = buildHistory([
      assessment({ id: 2, total: 480, created_at: '2026-08-02T09:00:00Z' }),
      assessment({ id: 1, total: 470, created_at: '2026-08-02T09:00:00Z' }),
    ]);
    expect(history.map((entry) => [entry.id, entry.change])).toStrictEqual([
      [2, 10],
      [1, null],
    ]);
  });
});
