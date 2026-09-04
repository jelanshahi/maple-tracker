'use client';

/**
 * The same profile scored again with one answer changed.
 *
 * The panel does arithmetic and stops. ARCHITECTURE.md section 7.3: state
 * facts, show gaps, link to IRCC - never a prediction, never a recommendation
 * about anybody's case. So no row is called worth making, no row is ranked
 * "best", and nothing here is compared to a cut-off: the table above already
 * shows where the estimate sits, and letting the reader hold the two side by
 * side is the whole design.
 *
 * Every number comes from whatIf.ts, which gets it from score(). Nothing is
 * computed here.
 */
import type { Profile, RuleSet } from '@maple/crs-rules';
import { formatInteger } from '../../src/format.ts';
import { NOMINATION_LEVER_KEY, leversFor } from '../../src/whatIf.ts';
import type { LeverGroup, LeverResult } from '../../src/whatIf.ts';
import { IRCC_ELIGIBILITY } from './CutoffGap.tsx';
import styles from '../ui.module.css';

/**
 * Nomination is absent: it is pinned below these as a single row of its own,
 * where its note can qualify it. A heading over one self-describing row would
 * only say the row again.
 */
const GROUP_LABELS: Record<Exclude<LeverGroup, 'nomination'>, string> = {
  language: 'Language',
  work: 'Work experience',
  education: 'Education',
  spouse: 'Your accompanying spouse',
};

const GROUPS = Object.keys(GROUP_LABELS) as ReadonlyArray<keyof typeof GROUP_LABELS>;

/**
 * The ladder pages colour a falling cut-off green because that is good news
 * from the candidate's point of view. A row here is good news in the same
 * sense, so it reuses the token rather than introducing a second palette.
 */
const leverRow = (lever: LeverResult) => (
  <tr key={lever.key}>
    <td className={styles.leverChange}>
      {lever.label}
      {lever.note === undefined ? null : <span className={styles.hint}> {lever.note}</span>}
    </td>
    <td className={styles.numeric}>
      <span className={styles.fall}>+{formatInteger(lever.delta)}</span>
    </td>
    <td className={styles.numeric}>{formatInteger(lever.total)}</td>
  </tr>
);

export function WhatIf({ profile, ruleSet }: { profile: Profile; ruleSet: RuleSet }) {
  const levers = leversFor(profile, ruleSet);

  // A profile that has already maxed every one of them gets no panel at all,
  // rather than a table of zeroes.
  if (levers.length === 0) {
    return null;
  }

  const nomination = levers.filter((lever) => lever.key === NOMINATION_LEVER_KEY);
  const grouped = GROUPS
    .map((group) => ({ group, rows: levers.filter((lever) => lever.group === group) }))
    .filter(({ rows }) => rows.length > 0);

  return (
    <section className={styles.card} aria-labelledby="what-if-heading">
      <h2 id="what-if-heading">The same profile with one answer changed</h2>
      <p>
        Each row is this profile scored again under {ruleSet.label}, with one answer different and
        everything else left as it is. These are arithmetic on IRCC&rsquo;s published criteria
        &mdash; not a route through the system, and not a statement about anybody&rsquo;s case.
      </p>
      <p className={styles.muted}>
        Whether any of these is open to you depends on your circumstances, and this page cannot know
        that. <a href={IRCC_ELIGIBILITY}>IRCC sets out who qualifies</a>.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Change</th>
              <th scope="col" className={styles.numeric}>Points</th>
              <th scope="col" className={styles.numeric}>Estimate</th>
            </tr>
          </thead>

          {grouped.map(({ group, rows }) => (
            <tbody key={group}>
              <tr>
                <th scope="rowgroup" colSpan={3}>{GROUP_LABELS[group]}</th>
              </tr>
              {rows.map(leverRow)}
            </tbody>
          ))}

          {nomination.length === 0 ? null : (
            <tbody className={styles.leverPinned}>{nomination.map(leverRow)}</tbody>
          )}
        </table>
      </div>
    </section>
  );
}
