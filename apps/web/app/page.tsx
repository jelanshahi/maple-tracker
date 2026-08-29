import { describeRoundType, formatDate, formatDateTime, formatInteger } from '../src/format.ts';
import { fetchCategories, fetchRounds } from '../src/queries.ts';
import { createReadClient } from '../src/supabase.ts';
import { RoundsTable } from './RoundsTable.tsx';
import styles from './ui.module.css';

export const revalidate = 900;

const RECENT_COUNT = 12;

export default async function LatestPage() {
  const client = createReadClient();
  const [rounds, categories] = await Promise.all([fetchRounds(client), fetchCategories(client)]);
  const categoryLabels = new Map(categories.map((category) => [category.code, category.label]));
  const latest = rounds[0];

  if (latest === undefined) {
    return <p>No rounds have been ingested yet.</p>;
  }

  const categoryLabel =
    latest.category_code === null ? null : categoryLabels.get(latest.category_code) ?? latest.category_code;

  return (
    <>
      <h1>Latest round</h1>
      <p className={styles.lede}>
        Express Entry rounds of invitations, as published by IRCC. {formatInteger(rounds.length)} rounds
        recorded.
      </p>

      <section className={styles.card} aria-labelledby="latest-heading">
        <h2 id="latest-heading">
          Round {latest.round_number} &middot; {describeRoundType(latest.round_type, categoryLabel)}
        </h2>
        <div className={styles.headline}>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{formatInteger(latest.cutoff_crs)}</span>
            <span className={styles.metricLabel}>Cut-off CRS</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{formatInteger(latest.invitations)}</span>
            <span className={styles.metricLabel}>Invitations</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{formatDate(latest.drawn_at)}</span>
            <span className={styles.metricLabel}>Drawn (UTC)</span>
          </div>
        </div>
        <p className={styles.muted}>
          {latest.tie_break_at === null
            ? 'No tie-break timestamp published for this round.'
            : `Tie-break: ${formatDateTime(latest.tie_break_at)}. Candidates at the cut-off score were invited only if their profile was submitted before this time.`}
        </p>
        <p>
          <a href={latest.source_url}>Read this round on IRCC&rsquo;s site</a>
        </p>
      </section>

      <h2>Recent rounds</h2>
      <RoundsTable rounds={rounds.slice(0, RECENT_COUNT)} categoryLabels={categoryLabels} />
    </>
  );
}
