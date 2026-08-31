'use client';

/**
 * The score, and everything behind it.
 *
 * ARCHITECTURE.md section 6: a bare number is useless to a user and
 * unauditable to us, so every section and every factor reports its own points.
 * Section 7.1: every number links to its source, which here means the rule
 * set's own IRCC citation. Section 7.2: the estimate disclaimer appears once,
 * clearly, on the screen showing the score, and points at IRCC's tool as the
 * authority.
 *
 * The warnings are rendered above the breakdown rather than below it. A blank
 * field scores zero, and a user who does not know that reads a wrongly low
 * total as a fact about themselves.
 */
import type { RuleSet, ScoreResult } from '@maple/crs-rules';
import { formatInteger } from '../../src/format.ts';
import styles from '../ui.module.css';

const IRCC_CALCULATOR =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score.html';

export function ScoreBreakdown({ result, ruleSet }: { result: ScoreResult; ruleSet: RuleSet }) {
  return (
    <section className={styles.card} aria-labelledby="score-heading">
      <h2 id="score-heading">Your estimated score</h2>

      <div className={styles.headline}>
        <div className={styles.metric}>
          <span className={styles.metricValue}>{formatInteger(result.total)}</span>
          <span className={styles.metricLabel}>Comprehensive Ranking System points</span>
        </div>
      </div>

      <p className={styles.estimate}>
        This is an estimate produced by this site, not a score from IRCC. Only IRCC scores a real
        Express Entry profile.{' '}
        <a href={IRCC_CALCULATOR}>Check it against IRCC&rsquo;s own calculator</a> before relying on
        it for anything.
      </p>

      {result.warnings.length > 0 ? (
        <div className={styles.warnings}>
          <h3>What is missing</h3>
          <p>
            Each of these scored zero because the answer was left blank. Nothing is guessed on your
            behalf, so your real score is likely higher than the number above.
          </p>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3>By section</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Section</th>
              <th scope="col" className={styles.numeric}>Points</th>
              <th scope="col" className={styles.numeric}>Maximum</th>
            </tr>
          </thead>
          <tbody>
            {result.sections.map((section) => (
              <tr key={section.key}>
                <td>
                  {section.label}
                  {section.capReached ? <span className={styles.hint}> at the maximum</span> : null}
                </td>
                <td className={styles.numeric}>{formatInteger(section.points)}</td>
                <td className={styles.numeric}>{formatInteger(section.cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>By factor</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Factor</th>
              <th scope="col" className={styles.numeric}>Points</th>
              <th scope="col">How it was worked out</th>
            </tr>
          </thead>
          <tbody>
            {result.factors.map((factor) => (
              <tr key={factor.key}>
                <td>{factor.label}</td>
                <td className={styles.numeric}>{formatInteger(factor.points)}</td>
                <td className={styles.muted}>{factor.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.muted}>
        Scored under {ruleSet.label}, in effect since {ruleSet.effectiveFrom}. Every points value
        above is transcribed from{' '}
        <a href={ruleSet.sourceUrl}>IRCC&rsquo;s published ranking criteria</a>.
      </p>
    </section>
  );
}
