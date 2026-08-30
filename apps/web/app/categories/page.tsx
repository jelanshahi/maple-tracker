import { formatChange, formatDate, formatInteger } from '../../src/format.ts';
import { buildLadder } from '../../src/ladder.ts';
import { fetchCategories, fetchPrograms, fetchRounds } from '../../src/queries.ts';
import { createReadClient } from '../../src/supabase.ts';
import styles from '../ui.module.css';

export const revalidate = 900;

export const metadata = {
  title: 'Cut-off ladder — Maple Tracker',
};

function changeClass(change: number | null): string | undefined {
  if (change === null || change === 0) return undefined;
  return change > 0 ? styles.rise : styles.fall;
}

function changeCell(entry: { comparable: boolean; change: number | null }): string {
  return entry.comparable ? formatChange(entry.change) : 'not comparable';
}

export default async function CategoriesPage() {
  const client = createReadClient();
  const [rounds, categories, programs] = await Promise.all([
    fetchRounds(client),
    fetchCategories(client),
    fetchPrograms(client),
  ]);
  const ladder = buildLadder(rounds, categories, programs);

  return (
    <>
      <h1>Cut-off ladder</h1>
      <p className={styles.lede}>
        Where each stream&rsquo;s line last landed, most recently drawn first. Movement compares a
        stream&rsquo;s latest round against its own previous round, never against another stream
        &mdash; a category cut-off and a program cut-off are not comparable numbers. Streams that
        have not been drawn in a long time still appear, with the date they last ran.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Stream</th>
              <th scope="col" className={styles.numeric}>Latest cut-off</th>
              <th scope="col" className={styles.numeric}>Movement</th>
              <th scope="col">Last drawn (UTC)</th>
              <th scope="col" className={styles.numeric}>Invitations</th>
              <th scope="col" className={styles.numeric}>Rounds</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((entry) => (
              <tr key={entry.key}>
                <th scope="row">{entry.label}</th>
                <td className={styles.numeric}>{formatInteger(entry.latest.cutoff_crs)}</td>
                <td className={`${styles.numeric} ${changeClass(entry.change) ?? styles.muted}`}>
                  {changeCell(entry)}
                </td>
                <td>{formatDate(entry.latest.drawn_at)}</td>
                <td className={styles.numeric}>{formatInteger(entry.latest.invitations)}</td>
                <td className={styles.numeric}>{formatInteger(entry.roundCount)}</td>
                <td>
                  <a href={entry.latest.source_url}>Round {entry.latest.round_number}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
