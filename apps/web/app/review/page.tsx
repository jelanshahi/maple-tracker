import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { currentUserId } from '../../src/accountQueries.ts';
import { createAuthClient } from '../../src/authClient.ts';
import { fetchReviewQueue, isEditor } from '../../src/newsQueries.ts';
import { ReviewItem } from './ReviewItem.tsx';
import styles from '../ui.module.css';

/** Per-user, so never cached. See /account and /history for the same note. */
export const dynamic = 'force-dynamic';

/**
 * The review queue.
 *
 * Anyone who is not an editor gets a plain 404 - the same page a mistyped URL
 * produces. A "you are not an editor" message would confirm to a stranger that
 * the console exists and that there is something here worth attacking. The
 * database agrees independently: the drafts policy returns nothing to an
 * account that is not on the roster.
 */
export default async function ReviewPage() {
  const client = createAuthClient(await cookies());
  const userId = await currentUserId(client);
  if (userId === null || !(await isEditor(client, userId))) notFound();

  const queue = await fetchReviewQueue(client);

  return (
    <>
      <h1>Review queue</h1>
      <p className={styles.lede}>
        {queue.length === 0
          ? 'Nothing is waiting. New IRCC announcements appear here after the next ingestion run.'
          : `${queue.length} announcement${queue.length === 1 ? '' : 's'} waiting, oldest first.`}
      </p>

      <p className={styles.muted}>
        IRCC publishes everything the department does, so most of this will not concern Express
        Entry. Publish what does; reject the rest. A rejected item does not come back on the next
        run, and nothing here can be reworded &mdash; what you publish is IRCC&rsquo;s own text.
      </p>

      {queue.length === 0 ? null : (
        <ul className={styles.newsList}>
          {queue.map((item) => (
            <ReviewItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}
