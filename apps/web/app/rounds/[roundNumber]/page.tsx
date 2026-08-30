import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  describeRoundType, formatChange, formatDate, formatDateTime, formatInteger,
  mergeStreamLabels, streamLabel,
} from '../../../src/format.ts';
import { previousInStream, streamKey } from '../../../src/ladder.ts';
import { fetchCategories, fetchPrograms, fetchRounds } from '../../../src/queries.ts';
import { createReadClient } from '../../../src/supabase.ts';
import styles from '../../ui.module.css';

export const revalidate = 900;

/**
 * Empty on purpose. Without a generateStaticParams at all, Next renders this
 * route on every request and §8's "keep the read path cacheable" stops holding.
 * Returning no paths prebuilds nothing - 438 rounds would be 438 build-time
 * renders of a page almost nobody asks for - while still letting each round
 * cache itself the first time it is actually requested.
 */
export function generateStaticParams(): { roundNumber: string }[] {
  return [];
}

/**
 * One round, and the one comparison that is fair to make about it: its own
 * stream's previous round.
 *
 * The round is found in the full history rather than fetched by round_number.
 * The history is already read, validated and cached for the other three
 * routes, the whole table is 438 rows, and it is needed here anyway to find the
 * previous round of the stream - so a second query would buy nothing. It also
 * means no dynamic segment ever reaches a query, which is a smaller surface
 * than parameterising one.
 */
export default async function RoundPage({ params }: { params: Promise<{ roundNumber: string }> }) {
  const { roundNumber } = await params;
  const client = createReadClient();
  const [rounds, categories, programs] = await Promise.all([
    fetchRounds(client),
    fetchCategories(client),
    fetchPrograms(client),
  ]);

  // decodeURIComponent because a round number is a path segment; '91a' needs no
  // escaping but nothing guarantees a future one will not.
  const wanted = decodeURIComponent(roundNumber);
  const round = rounds.find((candidate) => candidate.round_number === wanted);
  if (round === undefined) notFound();

  const streamLabels = mergeStreamLabels(categories, programs);
  const label = streamLabel(round, streamLabels);
  const previous = previousInStream(rounds, round);
  const comparable = streamKey(round) !== 'program';
  const change = previous === null || !comparable ? null : round.cutoff_crs - previous.cutoff_crs;

  return (
    <>
      <h1>Round {round.round_number}</h1>
      <p className={styles.lede}>
        {describeRoundType(round.round_type, label)} &middot; drawn {formatDate(round.drawn_at)} (UTC).
      </p>

      <section className={styles.card} aria-labelledby="round-heading">
        <h2 id="round-heading">Published figures</h2>
        <div className={styles.headline}>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{formatInteger(round.cutoff_crs)}</span>
            <span className={styles.metricLabel}>Cut-off CRS</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricValue}>{formatInteger(round.invitations)}</span>
            <span className={styles.metricLabel}>Invitations</span>
          </div>
          <div className={styles.metric}>
            <span className={`${styles.metricValue} ${changeClass(change) ?? styles.muted}`}>
              {comparable ? formatChange(change) : 'not comparable'}
            </span>
            <span className={styles.metricLabel}>Movement</span>
          </div>
        </div>

        <p className={styles.muted}>
          {round.tie_break_at === null
            ? 'No tie-break timestamp published for this round.'
            : `Tie-break: ${formatDateTime(round.tie_break_at)}. Candidates at the cut-off score were invited only if their profile was submitted before this time.`}
        </p>
        <p>
          <a href={round.source_url}>Read this round on IRCC&rsquo;s site</a>
        </p>
      </section>

      <h2>What the movement compares</h2>
      {previous === null ? (
        <p className={styles.muted}>
          This is the earliest recorded round of this stream, so there is nothing to compare it
          against.
        </p>
      ) : !comparable ? (
        <p className={styles.muted}>
          This round names no specific program, so its cut-off sits in a bucket that mixes programs
          scored on different scales. Withholding the figure is more honest than printing one.
        </p>
      ) : (
        <p>
          Against round{' '}
          <Link href={`/rounds/${encodeURIComponent(previous.round_number)}`}>
            {previous.round_number}
          </Link>
          , the previous {describeRoundType(previous.round_type, label)} round, drawn{' '}
          {formatDate(previous.drawn_at)} (UTC) with a cut-off of{' '}
          {formatInteger(previous.cutoff_crs)}.
        </p>
      )}

      <p>
        <Link href="/rounds">All rounds</Link>
      </p>
    </>
  );
}

function changeClass(change: number | null): string | undefined {
  if (change === null || change === 0) return undefined;
  return change > 0 ? styles.rise : styles.fall;
}
