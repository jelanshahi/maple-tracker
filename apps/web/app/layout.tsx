import Link from 'next/link';
import type { ReactNode } from 'react';
import { STALE_AFTER_HOURS, formatDateTime, isStale } from '../src/format.ts';
import { fetchLastVerifiedAt } from '../src/queries.ts';
import { createReadClient } from '../src/supabase.ts';
import './globals.css';
import styles from './ui.module.css';

export const metadata = {
  title: 'Maple Tracker',
  description: 'Express Entry round-of-invitations history and cut-off scores, from IRCC published data.',
};

/** Ingestion targets a 15 minute cadence, so re-rendering faster buys nothing. */
export const revalidate = 900;

function verificationMessage(lastVerified: string | null, stale: boolean): string {
  if (lastVerified === null) {
    return 'This site could not confirm when the data was last checked against IRCC. Treat it as out of date and use the official pages below.';
  }
  const when = `Last confirmed against IRCC on ${formatDateTime(lastVerified)}`;
  return stale ? `${when} — more than ${STALE_AFTER_HOURS} hours ago.` : `${when}.`;
}

/**
 * ARCHITECTURE.md section 1: a tracker showing three-week-old data as if it were
 * current is worse than one that is visibly down. This banner is that promise.
 */
function VerificationBanner({ lastVerified, now }: { lastVerified: string | null; now: Date }): ReactNode {
  const stale = isStale(lastVerified, now);
  const label = lastVerified === null ? 'Freshness unknown' : stale ? 'Possibly out of date' : 'Up to date';
  return (
    <p className={stale ? `${styles.banner} ${styles.bannerStale}` : styles.banner}>
      <span className={styles.bannerLabel}>{label}</span>
      <span>{verificationMessage(lastVerified, stale)}</span>
    </p>
  );
}

// Next requires a default export for a layout. CLAUDE.md's named-exports-only
// rule cannot apply to the App Router's own file contract; see its Layout note.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const lastVerified = await fetchLastVerifiedAt(createReadClient());

  return (
    <html lang="en">
      <body>
        <div className={styles.page}>
          <header className={styles.header}>
            <Link href="/" className={styles.wordmark}>
              Maple Tracker
            </Link>
            <nav className={styles.nav}>
              <Link href="/">Latest</Link>
              <Link href="/rounds">History</Link>
              <Link href="/categories">Cut-off ladder</Link>
            </nav>
          </header>

          <VerificationBanner lastVerified={lastVerified} now={new Date()} />

          <main>{children}</main>

          <footer className={styles.footer}>
            <p>
              <strong>Not affiliated with, endorsed by, or connected to Immigration, Refugees and
              Citizenship Canada or the Government of Canada.</strong> This is an independent personal
              project, and nothing here is immigration advice. For anything that matters, use the
              official pages.
            </p>
            <p>
              Every figure comes from IRCC&rsquo;s published rounds-of-invitations dataset and links
              back to the round it came from. Contains information licensed under the{' '}
              <a href="https://open.canada.ca/en/open-government-licence-canada">
                Open Government Licence &ndash; Canada
              </a>
              .
            </p>
            <p>
              Official sources:{' '}
              <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html">
                Rounds of invitations
              </a>{' '}
              &middot;{' '}
              <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score.html">
                IRCC&rsquo;s CRS calculator
              </a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
