import { cookies } from 'next/headers';
import Link from 'next/link';
import { currentUserId, fetchAssessments } from '../../src/accountQueries.ts';
import { createAuthClient } from '../../src/authClient.ts';
import { formatChange, formatDateTime, formatInteger } from '../../src/format.ts';
import { buildHistory } from '../../src/scoreHistory.ts';
import styles from '../ui.module.css';

/**
 * Your own past estimates.
 *
 * Per-user, so never cached: `cookies()` already forces a dynamic render and
 * this says so out loud, in case anyone later copies the `revalidate` export
 * from the public pages and starts serving one person's history to the next.
 */
export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const client = createAuthClient(await cookies());
  const userId = await currentUserId(client);

  if (userId === null) {
    return (
      <>
        <h1>Your score history</h1>
        <p className={styles.lede}>
          <Link href="/account">Sign in</Link> to see the scores you have saved. Every time you save
          your answers, the score is recorded here so you can see how it has moved.
        </p>
      </>
    );
  }

  const history = buildHistory(await fetchAssessments(client, userId));

  return (
    <>
      <h1>Your score history</h1>
      <p className={styles.lede}>
        Every score you have saved, newest first. These are estimates this site produced from the
        answers you gave, not scores from IRCC.
      </p>

      {history.length === 0 ? (
        <p>
          Nothing saved yet. Fill in the <Link href="/calculator">calculator</Link> and press save,
          and the score will appear here.
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Saved (UTC)</th>
                <th scope="col" className={styles.numeric}>Score</th>
                <th scope="col" className={styles.numeric}>Change</th>
                <th scope="col">Scored under</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt)}</td>
                  <td className={styles.numeric}>{formatInteger(entry.total)}</td>
                  <td className={styles.numeric}>
                    {entry.change === null ? (
                      <span className={styles.muted}>—</span>
                    ) : (
                      <span className={entry.change === 0 ? undefined : entry.change > 0 ? styles.fall : styles.rise}>
                        {formatChange(entry.change)}
                      </span>
                    )}
                  </td>
                  <td className={styles.muted}>{entry.ruleSetId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.muted}>
        Change is the difference from the save before it, and only between scores worked out under
        the same rules. It describes what you changed in your answers, and says nothing about what
        IRCC will do next.
      </p>
    </>
  );
}
