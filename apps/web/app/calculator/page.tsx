import { buildLadder } from '../../src/ladder.ts';
import { toCutoffMarks } from '../../src/gap.ts';
import { fetchCategories, fetchPrograms, fetchRounds } from '../../src/queries.ts';
import { createReadClient } from '../../src/supabase.ts';
import { CalculatorForm } from './CalculatorForm.tsx';
import styles from '../ui.module.css';

export const revalidate = 900;

const IRCC_LANGUAGE_TEST =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html';

/**
 * The server half of the calculator: it reads the published cut-offs, and
 * nothing else. The anon key stays here, as on every other route.
 *
 * What crosses to the browser is the handful of already-public fields the
 * comparison table renders - buildLadder has already worked out the most recent
 * round per stream, so there is no second grouping pass and no reason to ship
 * the full history down.
 *
 * The profile goes the other way and never leaves: score() runs in the client
 * component. Nothing is posted back, and there is no endpoint to post to.
 */
export default async function CalculatorPage() {
  const client = createReadClient();
  const [rounds, categories, programs] = await Promise.all([
    fetchRounds(client),
    fetchCategories(client),
    fetchPrograms(client),
  ]);
  const cutoffs = toCutoffMarks(buildLadder(rounds, categories, programs));

  return (
    <>
      <h1>CRS calculator</h1>
      <p className={styles.lede}>
        Work out an estimated Comprehensive Ranking System score, and see where it sits against the
        cut-offs of the rounds IRCC has already held.
      </p>

      <p className={styles.privacy}>
        <strong>Nothing you type here is sent anywhere or saved.</strong> The calculation runs
        entirely in your browser, and your answers are gone when you close the tab. This site has no
        accounts, and nothing on this page reaches its database.
      </p>

      <p className={styles.muted}>
        Language ability is asked as a Canadian Language Benchmark (CLB) for English or a Niveaux de
        compétence linguistique canadiens (NCLC) for French, because that is what the ranking
        criteria are written in.{' '}
        <a href={IRCC_LANGUAGE_TEST}>IRCC publishes the charts</a> that convert an IELTS, CELPIP,
        TEF or TCF result into those levels.
      </p>

      <CalculatorForm cutoffs={cutoffs} />
    </>
  );
}
