import { formatDate } from '../../src/format.ts';
import { fetchPublishedNews } from '../../src/newsQueries.ts';
import { createReadClient } from '../../src/supabase.ts';
import { TAG_LABELS, knownTags } from '../../src/tags.ts';
import styles from '../ui.module.css';

export const revalidate = 900;

/**
 * IRCC news that someone decided was worth your time.
 *
 * IRCC's newsroom carries everything the department does, most of which has
 * nothing to do with Express Entry. Nothing appears here until a human has
 * reviewed it, which is the whole point of the queue behind this page.
 *
 * Every item renders IRCC's own headline and summary and links to the release.
 * Nothing is rewritten: this site does not put words in IRCC's mouth about
 * immigration.
 */
export default async function NewsPage() {
  const items = await fetchPublishedNews(createReadClient());

  return (
    <>
      <h1>IRCC news</h1>
      <p className={styles.lede}>
        Announcements from Immigration, Refugees and Citizenship Canada that affect Express Entry.
        Each one is IRCC&rsquo;s own wording, and links to the release it came from.
      </p>

      {items.length === 0 ? (
        <p>
          Nothing has been published here yet. IRCC announcements appear once they have been
          reviewed &mdash; the department publishes a great deal that has nothing to do with Express
          Entry, and this page is not a mirror of it.
        </p>
      ) : (
        <ul className={styles.newsList}>
          {items.map((item) => {
            const tags = knownTags(item.tags);
            return (
              <li key={item.id} className={styles.newsItem}>
                <p className={styles.newsMeta}>
                  {formatDate(item.published_at)}
                  {tags.map((tag) => (
                    <span key={tag} className={styles.tag}>{TAG_LABELS[tag]}</span>
                  ))}
                </p>
                <h2 className={styles.newsTitle}>
                  <a href={item.url}>{item.title}</a>
                </h2>
                {item.summary === null ? null : <p className={styles.muted}>{item.summary}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <p className={styles.muted}>
        Headlines and summaries are reproduced from IRCC&rsquo;s newsroom under the Open Government
        Licence &ndash; Canada. This site is not affiliated with IRCC, and selecting which
        announcements appear here is an editorial choice made by this site, not by the department.
      </p>
    </>
  );
}
