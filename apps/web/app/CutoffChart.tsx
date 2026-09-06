'use client';

/**
 * Cut-off scores over time, one line per stream.
 *
 * All the arithmetic is in src/chart.ts, which is pure and tested. This file
 * holds three pieces of state - the window, which streams are switched off, and
 * which point the pointer is over - and turns what comes back into SVG.
 *
 * ARCHITECTURE.md section 7.5 is the rule this component lives closest to:
 * never present a comparison that is not like for like. Two streams share an
 * axis here because they share a unit, and nothing on the chart subtracts one
 * from the other. The note under the plot says so, and the chips exist so a
 * reader can put a single stream on its own axis in one click.
 *
 * The chips are the legend as well as the control, and there are deliberately
 * no labels at the ends of the lines. The design has them, and they work there
 * because its streams are called "CEC" and "PNP"; the real ones are called
 * "Healthcare and social services occupations", and a label that long at the
 * right-hand end of the plot pushes the whole page sideways. Abbreviating them
 * here would mean inventing names IRCC does not use.
 *
 * Nothing crosses the network. The rounds arrive as props from a server
 * component and are already public; this component only draws them.
 */
import { useState } from 'react';
import { VIEW, buildChart } from '../src/chart.ts';
import type { ChartPoint, ChartRange, ChartStream } from '../src/chart.ts';
import { formatDate, formatInteger } from '../src/format.ts';
import styles from './chart.module.css';
import ui from './ui.module.css';

const RANGES: readonly { key: ChartRange; label: string }[] = [
  { key: '1y', label: '1 year' },
  { key: '2y', label: '2 years' },
  { key: 'all', label: 'All' },
];

const percentX = (value: number): string => `${((value / VIEW.width) * 100).toFixed(3)}%`;
const percentY = (value: number): string => `${((value / VIEW.height) * 100).toFixed(3)}%`;

export function CutoffChart({
  points,
  streams,
  initiallyShown,
}: {
  points: readonly ChartPoint[];
  streams: readonly ChartStream[];
  /** The streams switched on before the reader touches anything. */
  initiallyShown: readonly string[];
}) {
  const [range, setRange] = useState<ChartRange>('2y');
  const [hidden, setHidden] = useState<ReadonlySet<string>>(
    () => new Set(streams.map((stream) => stream.key).filter((key) => !initiallyShown.includes(key))),
  );
  const [hovered, setHovered] = useState<ChartPoint | null>(null);

  const chart = buildChart(points, { range, hidden });

  const toggle = (key: string): void => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    setHovered(null);
  };

  const showOnly = (keys: readonly string[]): void => {
    setHidden(new Set(streams.map((stream) => stream.key).filter((key) => !keys.includes(key))));
    setHovered(null);
  };

  return (
    <section className={ui.card} aria-labelledby="trend-heading">
      <div className={styles.head}>
        <h2 id="trend-heading">Cut-off trend</h2>
        <div className={styles.ranges} role="group" aria-label="Time window">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={range === key}
              className={range === key ? `${styles.range} ${styles.rangeCurrent}` : styles.range}
              onClick={() => {
                setRange(key);
                setHovered(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chips}>
        {streams.map((stream) => {
          const on = !hidden.has(stream.key);
          return (
            <button
              key={stream.key}
              type="button"
              aria-pressed={on}
              className={on ? styles.chip : `${styles.chip} ${styles.chipOff}`}
              onClick={() => toggle(stream.key)}
            >
              <span
                className={styles.chipDot}
                style={{ background: on ? stream.colour : 'var(--border)' }}
              />
              {stream.label}
            </button>
          );
        })}
        <span className={styles.chipActions}>
          <button type="button" className={styles.link} onClick={() => showOnly(initiallyShown)}>
            Reset
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={() => showOnly(streams.map((stream) => stream.key))}
          >
            Show every stream
          </button>
        </span>
      </div>

      <div className={styles.plot} onMouseLeave={() => setHovered(null)}>
        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          className={styles.svg}
          role="img"
          aria-label={`Cut-off score by stream over time. ${chart.roundCount} rounds shown. The table below lists every round.`}
        >
          {chart.grid.map((line) => (
            <line
              key={line.label}
              className={styles.gridLine}
              x1={VIEW.left}
              x2={VIEW.right}
              y1={line.y}
              y2={line.y}
            />
          ))}

          {chart.series.map((series) => {
            const dimmed = hovered !== null && hovered.key !== series.key;
            return (
              <g key={series.key} style={{ stroke: series.colour }}>
                {series.line === '' ? null : (
                  <polyline
                    points={series.line}
                    className={dimmed ? `${styles.line} ${styles.lineDim}` : styles.line}
                  />
                )}
                {series.dots.map((dot) => {
                  const on = hovered !== null && hovered.roundNumber === dot.point.roundNumber;
                  return (
                    <g key={dot.point.roundNumber}>
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r={on ? 5 : 3}
                        className={on ? `${styles.dot} ${styles.dotOn}` : styles.dot}
                        style={on ? { fill: series.colour } : undefined}
                        opacity={dimmed ? 0.25 : 1}
                      />
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r={11}
                        className={styles.hit}
                        onMouseEnter={() => setHovered(dot.point)}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        <div className={styles.overlay} aria-hidden="true">
          {chart.grid.map((line) => (
            <span key={line.label} className={styles.gridLabel} style={{ top: percentY(line.y) }}>
              {line.label}
            </span>
          ))}
          {chart.ticks.map((tick) => (
            <span key={tick.label} className={styles.tickLabel} style={{ left: percentX(tick.x) }}>
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <p className={styles.detail} aria-live="polite">
        {hovered === null ? (
          <span className={ui.muted}>
            {formatInteger(chart.roundCount)} rounds shown. Hover a point for the round it came from.
          </span>
        ) : (
          <>
            <span className={styles.detailStream}>
              <span
                className={ui.dot}
                style={{ background: chart.series.find((s) => s.key === hovered.key)?.colour }}
              />
              {hovered.label}
            </span>
            <span className={ui.muted}>
              Round {hovered.roundNumber} &middot; {formatDate(hovered.drawnAt)}
            </span>
            <span className={styles.detailFigure}>CRS {formatInteger(hovered.cutoffCrs)}</span>
            <span className={`${styles.detailFigure} ${ui.muted}`}>
              {formatInteger(hovered.invitations)} invitations
            </span>
            <a href={hovered.sourceUrl}>IRCC</a>
          </>
        )}
      </p>

      <p className={styles.caveat}>
        Each line is one stream&rsquo;s own history. They share an axis because they share a unit,
        not because they are comparable &mdash; a category cut-off and a program cut-off are set by
        different rounds under different rules, and the difference between two lines is not a
        meaningful number. Switch streams off to read one on its own scale.
      </p>
    </section>
  );
}
