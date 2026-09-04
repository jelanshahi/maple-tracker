'use client';

/**
 * Where the estimate sits against the most recent published cut-off in each
 * stream.
 *
 * Every word here is past tense on purpose. ARCHITECTURE.md section 7.3: state
 * facts, show gaps, link to IRCC - never a prediction, never a recommendation
 * about anybody's case. IRPA s.91 restricts giving immigration advice for
 * consideration to authorised representatives, which makes that a legal
 * boundary and not an editorial preference.
 *
 * Section 7.5: never present a comparison that is not like for like. A stream
 * whose rounds are not comparable shows its cut-off and no difference at all.
 */
import { NOMINATION_STREAM_KEY, gapsFor } from '../../src/gap.ts';
import type { CutoffMark } from '../../src/gap.ts';
import { formatDate, formatInteger } from '../../src/format.ts';
import styles from '../ui.module.css';

/**
 * Exported because WhatIf makes the same point and must link to the same place.
 * A URL duplicated in two files is a URL that drifts in one of them, and this
 * one is the app's only pointer at who actually decides eligibility. It moves
 * to a shared module if a third caller appears, not before.
 */
export const IRCC_ELIGIBILITY =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/who-can-apply.html';

function differenceText(difference: number): string {
  if (difference === 0) return 'exactly at it';
  const points = formatInteger(Math.abs(difference));
  return difference > 0 ? `${points} above` : `${points} below`;
}

/**
 * The ladder pages colour a rising cut-off as bad news and a falling one as
 * good, so the token names read from the cut-off's point of view. Here the
 * subject is the candidate: being above the line is the good outcome, which is
 * the same green. Reusing the tokens keeps one palette; the names are the
 * ladder's.
 */
function differenceClass(difference: number): string | undefined {
  if (difference === 0) return undefined;
  return difference > 0 ? styles.fall : styles.rise;
}

export function CutoffGap({ total, cutoffs }: { total: number; cutoffs: readonly CutoffMark[] }) {
  const gaps = gapsFor(total, cutoffs);

  if (gaps.length === 0) {
    return null;
  }

  return (
    <section className={styles.card} aria-labelledby="gap-heading">
      <h2 id="gap-heading">Against the most recent published rounds</h2>
      <p>
        These are rounds IRCC has already held. They are a record of what happened, not a forecast:
        future cut-offs are set by IRCC and are not predictable from past ones.
      </p>
      <p className={styles.muted}>
        This page does not assess whether you are eligible for any of these streams. Eligibility
        depends on your occupation, your work history and the stream&rsquo;s own rules.{' '}
        <a href={IRCC_ELIGIBILITY}>IRCC sets out who qualifies</a>.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Stream</th>
              <th scope="col" className={styles.numeric}>Cut-off</th>
              <th scope="col">Your estimate</th>
              <th scope="col">Round</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map(({ mark, difference }) => (
              <tr key={mark.key}>
                <td>
                  {mark.label}
                  {mark.key === NOMINATION_STREAM_KEY ? (
                    <span className={styles.hint}>
                      {' '}
                      These rounds invite only candidates who already hold a provincial nomination,
                      which is worth 600 points by itself.
                    </span>
                  ) : null}
                </td>
                <td className={styles.numeric}>{formatInteger(mark.cutoffCrs)}</td>
                <td>
                  {difference === null ? (
                    <span className={styles.muted}>
                      not compared &mdash; this bucket mixes streams whose cut-offs are hundreds of
                      points apart
                    </span>
                  ) : (
                    <span className={differenceClass(difference)}>{differenceText(difference)}</span>
                  )}
                </td>
                <td className={styles.muted}>
                  {mark.roundNumber} &middot; {formatDate(mark.drawnAt)}
                </td>
                <td>
                  <a href={mark.sourceUrl}>IRCC</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
