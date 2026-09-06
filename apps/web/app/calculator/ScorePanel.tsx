'use client';

/**
 * The total, and how the sections add up to it.
 *
 * Split from ScoreBreakdown so each file has one job: this is the summary the
 * eye lands on, and that is the audit trail underneath it. It is the one dark
 * card in the content area, matching the header and footer.
 *
 * There is deliberately no bar for the total. The design has one, and any
 * honest denominator for it would have to be invented: the section caps do not
 * sum to a reachable score, because core and spouse trade against each other -
 * the core maximum is 500 alone and 460 with an accompanying spouse. A bar
 * measured against a total nobody can score is a bar that lies at every width.
 * Each section's own bar is exact, and those are the ones drawn.
 *
 * Every number here comes from score() and every cap from the rule set. No
 * points value is written in this file, per CLAUDE.md.
 */
import type { ScoreResult } from '@maple/crs-rules';
import { formatInteger } from '../../src/format.ts';
import styles from '../ui.module.css';

/** Guarded so a rule set that ever declares a zero-cap section cannot divide by it. */
function fillWidth(points: number, cap: number): string {
  if (cap <= 0) return '0%';
  return `${Math.min(100, (points / cap) * 100).toFixed(1)}%`;
}

export function ScorePanel({ result }: { result: ScoreResult }) {
  return (
    <section className={styles.scorePanel} aria-labelledby="score-heading">
      <p className={styles.statLabel} id="score-heading">
        Estimated CRS
      </p>
      <p className={styles.scoreValue}>{formatInteger(result.total)}</p>

      <div className={styles.scoreSections}>
        {result.sections.map((section) => (
          <div key={section.key} className={styles.scoreSection}>
            <span className={styles.scoreSectionLabel}>
              {section.label}
              {section.capReached ? ' — at the maximum' : ''}
            </span>
            <span
              className={styles.scoreSectionTrack}
              role="img"
              aria-label={`${formatInteger(section.points)} of a maximum ${formatInteger(section.cap)}`}
            >
              <span
                className={styles.scoreSectionFill}
                style={{ width: fillWidth(section.points, section.cap) }}
              />
            </span>
            <span className={styles.scoreSectionPoints}>{formatInteger(section.points)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
