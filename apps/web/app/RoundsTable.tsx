import Link from 'next/link';
import { describeRoundType, formatDate, formatDateTime, formatInteger, streamLabel } from '../src/format.ts';
import type { DrawRound } from '../src/rows.ts';
import styles from './ui.module.css';

/**
 * Used by both the latest-draw page and the full history. Two callers of one
 * table is composition, not the speculative abstraction CLAUDE.md warns about -
 * the alternative is the same thirty lines of markup written twice.
 *
 * Every row carries its source link. ARCHITECTURE.md section 7: a number
 * without provenance does not render.
 */
export function RoundsTable({
  rounds,
  streamLabels,
}: {
  rounds: readonly DrawRound[];
  streamLabels: ReadonlyMap<string, string>;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Round</th>
            <th scope="col">Drawn (UTC)</th>
            <th scope="col">Stream</th>
            <th scope="col" className={styles.numeric}>Cut-off CRS</th>
            <th scope="col" className={styles.numeric}>Invitations</th>
            <th scope="col">Tie-break (UTC)</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => {
            const label = streamLabel(round, streamLabels);
            return (
              <tr key={round.round_number}>
                <td>
                  <Link href={`/rounds/${encodeURIComponent(round.round_number)}`}>
                    {round.round_number}
                  </Link>
                </td>
                <td>{formatDate(round.drawn_at)}</td>
                <td>{describeRoundType(round.round_type, label)}</td>
                <td className={styles.numeric}>{formatInteger(round.cutoff_crs)}</td>
                <td className={styles.numeric}>{formatInteger(round.invitations)}</td>
                <td className={styles.muted}>
                  {round.tie_break_at === null ? '—' : formatDateTime(round.tie_break_at)}
                </td>
                <td>
                  <a href={round.source_url}>IRCC</a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
