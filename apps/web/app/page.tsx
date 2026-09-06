import { chartStreams, toChartPoints } from '../src/chart.ts';
import {
  describeRoundType, formatChange, formatDate, formatDateTime, formatInteger, mergeStreamLabels,
  streamLabel,
} from '../src/format.ts';
import { buildLadder } from '../src/ladder.ts';
import { fetchCategories, fetchPrograms, fetchRounds } from '../src/queries.ts';
import { createReadClient } from '../src/supabase.ts';
import { CutoffChart } from './CutoffChart.tsx';
import { RoundsTable } from './RoundsTable.tsx';
import styles from './ui.module.css';

export const revalidate = 900;

const RECENT_COUNT = 12;
/** How many streams the chart starts with switched on. */
const OPENING_STREAMS = 3;

export default async function LatestPage() {
  const client = createReadClient();
  const [rounds, categories, programs] = await Promise.all([
    fetchRounds(client),
    fetchCategories(client),
    fetchPrograms(client),
  ]);
  const streamLabels = mergeStreamLabels(categories, programs);
  const latest = rounds[0];

  if (latest === undefined) {
    return <p>No rounds have been ingested yet.</p>;
  }

  // buildLadder orders by most recently drawn, so its first entry is this same
  // round - and it has already applied the rule about which streams may show
  // movement at all. Recomputing that here would be a second copy of it.
  const newest = buildLadder(rounds, categories, programs)[0];
  const points = toChartPoints(rounds, streamLabels);
  const streams = chartStreams(points);
  const opening = [...streams]
    .sort((a, b) => b.roundCount - a.roundCount)
    .slice(0, OPENING_STREAMS)
    .map((stream) => stream.key);

  const oldest = rounds.at(-1);
  const latestLabel = describeRoundType(latest.round_type, streamLabel(latest, streamLabels));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            Round {latest.round_number} &middot; {formatDate(latest.drawn_at)}
          </p>
          <h1>{latestLabel}</h1>
        </div>
        <a href={latest.source_url}>Read this round on IRCC&rsquo;s site &rarr;</a>
      </div>

      <div className={styles.statGrid}>
        <div className={`${styles.stat} ${styles.statInk}`}>
          <p className={styles.statLabel}>Cut-off CRS</p>
          <p className={styles.statValue}>{formatInteger(latest.cutoff_crs)}</p>
          <p className={styles.statNote}>
            {newest === undefined || !newest.comparable || newest.change === null
              ? 'No earlier round of this stream to compare against.'
              : `${formatChange(newest.change)} against the previous round of this stream.`}
          </p>
        </div>

        <div className={styles.stat}>
          <p className={styles.statLabel}>Invitations</p>
          <p className={styles.statValue}>{formatInteger(latest.invitations)}</p>
          <p className={styles.statNote}>Issued to candidates at or above the cut-off.</p>
        </div>

        <div className={styles.stat}>
          <p className={styles.statLabel}>Tie-break</p>
          <p className={styles.statValueSmall}>
            {latest.tie_break_at === null ? 'None published' : formatDateTime(latest.tie_break_at)}
          </p>
          <p className={styles.statNote}>
            {latest.tie_break_at === null
              ? 'IRCC published no tie-break timestamp for this round.'
              : 'Candidates at the cut-off were invited only if their profile was submitted before this time.'}
          </p>
        </div>

        <div className={styles.stat}>
          <p className={styles.statLabel}>Rounds recorded</p>
          <p className={styles.statValue}>{formatInteger(rounds.length)}</p>
          <p className={styles.statNote}>
            {oldest === undefined ? 'From IRCC’s published dataset.' : `Back to ${formatDate(oldest.drawn_at)}.`}
          </p>
        </div>
      </div>

      <CutoffChart points={points} streams={streams} initiallyShown={opening} />

      <h2>Recent rounds</h2>
      <RoundsTable rounds={rounds.slice(0, RECENT_COUNT)} streamLabels={streamLabels} />
    </>
  );
}
