/**
 * The cut-off trend chart, as data.
 *
 * Pure: rounds in, coordinates out. No React, no DOM, no clock - the window is
 * measured back from the newest round in the data rather than from
 * `Date.now()`, so the same fixture always produces the same chart and the
 * tests do not need a frozen clock.
 *
 * ARCHITECTURE.md section 7.5, "never present a comparison that is not like for
 * like", applies here and shapes the whole module: each stream is its own
 * series with its own colour and its own label, and nothing in this file
 * subtracts one stream's cut-off from another's. Two lines share an axis
 * because they share a unit, not because they are comparable, and the chart
 * says so in words beside it.
 */
import { describeRoundType, parseTimestamp, streamLabel } from './format.ts';
import { streamKey } from './ladder.ts';
import type { DrawRound } from './rows.ts';
import { streamColour } from './streamColours.ts';

/** The SVG the component draws into. Coordinates below are in these units. */
export const VIEW = { width: 900, height: 320, left: 46, right: 838, top: 16, bottom: 290 } as const;

const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<ChartRange, number | null> = { '1y': 365, '2y': 730, all: null };
/** Months between x-axis ticks, wide enough that labels never collide. */
const TICK_MONTHS: Record<ChartRange, number> = { '1y': 2, '2y': 4, all: 6 };
const GRID_LINES = 4;

export type ChartRange = '1y' | '2y' | 'all';

/** What a round is reduced to before it crosses to the browser. */
export type ChartPoint = {
  key: string;
  label: string;
  roundNumber: string;
  drawnAt: string;
  cutoffCrs: number;
  invitations: number;
  sourceUrl: string;
};

export type ChartDot = { point: ChartPoint; x: number; y: number };

export type ChartSeries = {
  key: string;
  label: string;
  colour: string;
  /** A polyline `points` attribute. Empty when the stream has one round in range. */
  line: string;
  dots: readonly ChartDot[];
};

export type ChartStream = { key: string; label: string; colour: string; roundCount: number };

export type Chart = {
  series: readonly ChartSeries[];
  grid: readonly { y: number; label: string }[];
  ticks: readonly { x: number; label: string }[];
  roundCount: number;
};

const TICK_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', year: '2-digit' });

function at(point: ChartPoint): number {
  return parseTimestamp(point.drawnAt).getTime();
}

/**
 * Rounds reduced to what the chart needs, newest first.
 *
 * Called on the server so that the browser receives seven fields per round
 * rather than a whole `draw_rounds` row. Every field here is already public and
 * already rendered somewhere on the page; `raw` is not among them, and could
 * not be - see CLAUDE.md on never selecting it.
 */
export function toChartPoints(
  rounds: readonly DrawRound[],
  streamLabels: ReadonlyMap<string, string>,
): ChartPoint[] {
  return rounds.map((round) => ({
    key: streamKey(round),
    // The same label the tables and the ladder use, from the same helpers, so a
    // stream cannot end up called two things on one page.
    label: describeRoundType(round.round_type, streamLabel(round, streamLabels)),
    roundNumber: round.round_number,
    drawnAt: round.drawn_at,
    cutoffCrs: round.cutoff_crs,
    invitations: round.invitations,
    sourceUrl: round.source_url,
  }));
}

/**
 * Every stream present in the data, most recently drawn first - the order the
 * ladder uses, so the chips and the ladder agree about which streams are live.
 */
export function chartStreams(points: readonly ChartPoint[]): ChartStream[] {
  const seen = new Map<string, { label: string; roundCount: number; newest: number }>();
  for (const point of points) {
    const existing = seen.get(point.key);
    if (existing === undefined) {
      seen.set(point.key, { label: point.label, roundCount: 1, newest: at(point) });
    } else {
      existing.roundCount += 1;
      existing.newest = Math.max(existing.newest, at(point));
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1].newest - a[1].newest)
    .map(([key, value]) => ({ key, label: value.label, colour: streamColour(key), roundCount: value.roundCount }));
}

function niceBounds(values: readonly number[]): { low: number; high: number } {
  if (values.length === 0) return { low: 300, high: 600 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(20, (max - min) * 0.12);
  return { low: Math.floor((min - pad) / 10) * 10, high: Math.ceil((max + pad) / 10) * 10 };
}

function monthTicks(from: number, to: number, months: number): number[] {
  const ticks: number[] = [];
  const end = new Date(to);
  let cursor = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (cursor >= from) {
    ticks.push(cursor);
    const step = new Date(cursor);
    cursor = Date.UTC(step.getUTCFullYear(), step.getUTCMonth() - months, 1);
  }
  return ticks;
}

/**
 * The chart for one range and one set of visible streams.
 *
 * `hidden` is the set of stream keys the reader has switched off. Hiding a
 * stream rescales the axes, which is the point of the control: three streams
 * whose lines sit 300 points apart compress each other into flat lines.
 */
export function buildChart(
  points: readonly ChartPoint[],
  { range, hidden }: { range: ChartRange; hidden: ReadonlySet<string> },
): Chart {
  const times = points.map(at);
  const newest = times.length > 0 ? Math.max(...times) : 0;
  const days = RANGE_DAYS[range];
  const from = days === null ? Math.min(...times, newest) : newest - days * DAY_MS;

  const visible = points.filter((point) => at(point) >= from && !hidden.has(point.key));
  const { low, high } = niceBounds(visible.map((point) => point.cutoffCrs));
  const oldest = visible.length > 0 ? Math.min(...visible.map(at)) : from;
  const span = Math.max(1, newest - Math.max(from, oldest));

  const x = (time: number): number =>
    VIEW.left + ((time - Math.max(from, oldest)) / span) * (VIEW.right - VIEW.left);
  const y = (value: number): number =>
    VIEW.bottom - ((value - low) / Math.max(1, high - low)) * (VIEW.bottom - VIEW.top);

  const byStream = new Map<string, ChartPoint[]>();
  for (const point of visible) {
    const existing = byStream.get(point.key);
    if (existing === undefined) byStream.set(point.key, [point]);
    else existing.push(point);
  }

  const series = [...byStream.entries()].map(([key, group]) => {
    const ordered = [...group].sort((a, b) => at(a) - at(b));
    const dots = ordered.map((point) => ({
      point,
      x: Number(x(at(point)).toFixed(1)),
      y: Number(y(point.cutoffCrs).toFixed(1)),
    }));
    return {
      key,
      label: ordered[0]?.label ?? key,
      colour: streamColour(key),
      line: dots.length > 1 ? dots.map((dot) => `${dot.x},${dot.y}`).join(' ') : '',
      dots,
    };
  });

  const grid = Array.from({ length: GRID_LINES + 1 }, (_, index) => {
    const value = low + ((high - low) * index) / GRID_LINES;
    return { y: Number(y(value).toFixed(1)), label: String(Math.round(value)) };
  });

  const ticks = monthTicks(Math.max(from, oldest), newest, TICK_MONTHS[range]).map((time) => ({
    x: Number(x(time).toFixed(1)),
    label: TICK_FORMAT.format(new Date(time)),
  }));

  return { series, grid, ticks, roundCount: visible.length };
}
