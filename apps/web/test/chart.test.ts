import { describe, expect, it } from 'vitest';
import { VIEW, buildChart, chartStreams, toChartPoints } from '../src/chart.ts';
import type { ChartPoint } from '../src/chart.ts';
import type { Category, DrawRound, Program } from '../src/rows.ts';

function round(
  overrides: Partial<DrawRound> & Pick<DrawRound, 'round_number' | 'drawn_at'>,
): DrawRound {
  return {
    round_type: 'category',
    category_code: 'french',
    program_code: null,
    cutoff_crs: 400,
    invitations: 5000,
    tie_break_at: null,
    source_url: 'https://www.canada.ca/example',
    ...overrides,
  };
}

function point(overrides: Partial<ChartPoint> & Pick<ChartPoint, 'roundNumber' | 'drawnAt'>): ChartPoint {
  return {
    key: 'french',
    label: 'French-language proficiency',
    cutoffCrs: 400,
    invitations: 5000,
    sourceUrl: 'https://www.canada.ca/example',
    ...overrides,
  };
}

const categories: Category[] = [{ code: 'french', label: 'French-language proficiency' }];
const programs: Program[] = [{ code: 'cec', label: 'Canadian Experience Class' }];
const labels = new Map([...programs, ...categories].map((entry) => [entry.code, entry.label]));

const DAY = 86_400_000;
const iso = (daysAgo: number): string => new Date(Date.UTC(2026, 7, 26) - daysAgo * DAY).toISOString();

describe('toChartPoints', () => {
  it('reduces a round to the fields the chart needs', () => {
    const points = toChartPoints(
      [round({ round_number: '412', drawn_at: '2026-08-26T00:00:00Z', cutoff_crs: 481 })],
      labels,
    );
    expect(points).toStrictEqual([
      {
        key: 'french',
        label: 'French-language proficiency',
        roundNumber: '412',
        drawnAt: '2026-08-26T00:00:00Z',
        cutoffCrs: 481,
        invitations: 5000,
        sourceUrl: 'https://www.canada.ca/example',
      },
    ]);
  });

  it('carries no column the tables do not already render, and never raw', () => {
    const [only] = toChartPoints([round({ round_number: '1', drawn_at: '2026-01-01T00:00:00Z' })], labels);
    expect(Object.keys(only ?? {}).sort()).toStrictEqual([
      'cutoffCrs', 'drawnAt', 'invitations', 'key', 'label', 'roundNumber', 'sourceUrl',
    ]);
  });

  it('labels a round the same way the tables do, including the uncoded bucket', () => {
    const points = toChartPoints(
      [
        round({ round_number: '2', drawn_at: '2026-01-02T00:00:00Z', round_type: 'program', category_code: null, program_code: 'cec' }),
        round({ round_number: '3', drawn_at: '2026-01-03T00:00:00Z', round_type: 'program', category_code: null, program_code: null }),
        round({ round_number: '4', drawn_at: '2026-01-04T00:00:00Z', round_type: 'general', category_code: null, program_code: null }),
      ],
      labels,
    );
    expect(points.map((entry) => [entry.key, entry.label])).toStrictEqual([
      ['cec', 'Canadian Experience Class'],
      ['program', 'Program-specific (uncategorised)'],
      ['general', 'General (all programs)'],
    ]);
  });
});

describe('chartStreams', () => {
  const points = [
    point({ roundNumber: '1', drawnAt: iso(400) }),
    point({ roundNumber: '2', drawnAt: iso(10) }),
    point({ roundNumber: '3', drawnAt: iso(2), key: 'cec', label: 'Canadian Experience Class' }),
  ];

  it('lists each stream once, most recently drawn first', () => {
    expect(chartStreams(points).map((stream) => stream.key)).toStrictEqual(['cec', 'french']);
  });

  it('counts every round of a stream, not just the ones in any window', () => {
    expect(chartStreams(points).find((stream) => stream.key === 'french')?.roundCount).toBe(2);
  });

  it('gives a stream a colour token rather than a literal, so both themes can define it', () => {
    expect(chartStreams(points)[0]?.colour).toMatch(/^var\(--stream-/);
  });

  it('gives the uncoded program bucket the grey that means "no stream"', () => {
    const uncoded = chartStreams([point({ roundNumber: '9', drawnAt: iso(1), key: 'program' })]);
    expect(uncoded[0]?.colour).toBe('var(--stream-none)');
  });
});

/**
 * The window is measured back from the newest round in the data, not from the
 * clock, so these assertions do not need a frozen `now`.
 */
describe('buildChart windows', () => {
  const points = [
    point({ roundNumber: 'old', drawnAt: iso(900) }),
    point({ roundNumber: 'mid', drawnAt: iso(500) }),
    point({ roundNumber: 'new', drawnAt: iso(0) }),
  ];

  it('keeps only the rounds inside a one-year window', () => {
    const chart = buildChart(points, { range: '1y', hidden: new Set() });
    expect(chart.roundCount).toBe(1);
    expect(chart.series[0]?.dots.map((dot) => dot.point.roundNumber)).toStrictEqual(['new']);
  });

  it('widens to two years', () => {
    expect(buildChart(points, { range: '2y', hidden: new Set() }).roundCount).toBe(2);
  });

  it('keeps everything on the all-time window', () => {
    expect(buildChart(points, { range: 'all', hidden: new Set() }).roundCount).toBe(3);
  });

  it('drops a hidden stream from the plot entirely', () => {
    const mixed = [...points, point({ roundNumber: 'cec', drawnAt: iso(1), key: 'cec' })];
    const chart = buildChart(mixed, { range: 'all', hidden: new Set(['french']) });
    expect(chart.series.map((series) => series.key)).toStrictEqual(['cec']);
    expect(chart.roundCount).toBe(1);
  });
});

describe('buildChart scales', () => {
  // Two rounds 100 points apart. The padding is 12% of the spread or 20 points,
  // whichever is larger - 20 here - and the bounds round outwards to a ten, so
  // the axis runs 380 to 520. These coordinates are worked through by hand from
  // those bounds rather than read back off the implementation.
  const points = [
    point({ roundNumber: 'low', drawnAt: iso(30), cutoffCrs: 400 }),
    point({ roundNumber: 'high', drawnAt: iso(0), cutoffCrs: 500 }),
  ];
  const chart = buildChart(points, { range: 'all', hidden: new Set() });

  it('runs the y axis from a padded, rounded low to a padded, rounded high', () => {
    expect(chart.grid.map((line) => line.label)).toStrictEqual(['380', '415', '450', '485', '520']);
  });

  it('puts the bottom grid line on the plot floor and the top one on its ceiling', () => {
    expect(chart.grid[0]?.y).toBe(VIEW.bottom);
    expect(chart.grid[4]?.y).toBe(VIEW.top);
  });

  it('places a cut-off at its own height on that axis', () => {
    // 290 - ((400 - 380) / 140) * (290 - 16) = 250.9
    expect(chart.series[0]?.dots[0]?.y).toBe(250.9);
    // 290 - ((500 - 380) / 140) * (290 - 16) = 55.1
    expect(chart.series[0]?.dots[1]?.y).toBe(55.1);
  });

  it('spans the plot width from the oldest round in range to the newest', () => {
    expect(chart.series[0]?.dots[0]?.x).toBe(VIEW.left);
    expect(chart.series[0]?.dots[1]?.x).toBe(VIEW.right);
  });

  it('orders each series oldest first, so the polyline reads left to right', () => {
    expect(chart.series[0]?.line).toBe('46,250.9 838,55.1');
  });

  it('rescales when a stream is hidden, which is what the chips are for', () => {
    const withOutlier = [...points, point({ roundNumber: 'pnp', drawnAt: iso(5), cutoffCrs: 760, key: 'pnp' })];
    const all = buildChart(withOutlier, { range: 'all', hidden: new Set() });
    const without = buildChart(withOutlier, { range: 'all', hidden: new Set(['pnp']) });
    expect(all.grid.at(-1)?.label).toBe('810');
    expect(without.grid.at(-1)?.label).toBe('520');
  });
});

describe('buildChart edges', () => {
  it('draws no line for a stream with a single round in range, but keeps its point', () => {
    const chart = buildChart([point({ roundNumber: 'only', drawnAt: iso(0) })], {
      range: 'all',
      hidden: new Set(),
    });
    expect(chart.series[0]?.line).toBe('');
    expect(chart.series[0]?.dots).toHaveLength(1);
  });

  it('survives an empty dataset rather than dividing by a zero span', () => {
    const chart = buildChart([], { range: '2y', hidden: new Set() });
    expect(chart.series).toStrictEqual([]);
    expect(chart.roundCount).toBe(0);
    expect(chart.grid).toHaveLength(5);
  });

});
