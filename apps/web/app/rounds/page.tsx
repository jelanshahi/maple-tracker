import { formatDate, formatInteger } from '../../src/format.ts';
import { fetchCategories, fetchRounds } from '../../src/queries.ts';
import { createReadClient } from '../../src/supabase.ts';
import { RoundsTable } from '../RoundsTable.tsx';
import styles from '../ui.module.css';

export const revalidate = 900;

export const metadata = {
  title: 'Round history — Maple Tracker',
};

export default async function RoundsPage() {
  const client = createReadClient();
  const [rounds, categories] = await Promise.all([fetchRounds(client), fetchCategories(client)]);
  const categoryLabels = new Map(categories.map((category) => [category.code, category.label]));
  const oldest = rounds.at(-1);

  return (
    <>
      <h1>Round history</h1>
      <p className={styles.lede}>
        Every round of invitations IRCC has published
        {oldest === undefined ? '' : `, back to ${formatDate(oldest.drawn_at)}`}.{' '}
        {formatInteger(rounds.length)} rounds, newest first. Ordered by draw date rather than round
        number, because IRCC has published rounds numbered 91a and 91b.
      </p>
      <RoundsTable rounds={rounds} categoryLabels={categoryLabels} />
    </>
  );
}
