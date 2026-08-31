import { cookies } from 'next/headers';
import Link from 'next/link';
import { currentUserId, fetchSavedProfile } from '../../src/accountQueries.ts';
import { createAuthClient } from '../../src/authClient.ts';
import { formatDateTime } from '../../src/format.ts';
import { DeleteAccount } from './DeleteAccount.tsx';
import { SignInForm } from './SignInForm.tsx';
import { signOut } from './actions.ts';
import styles from '../ui.module.css';

/**
 * Sign in, or see what this account holds and how to remove it.
 *
 * Not ISR-cached, unlike every other route: this page depends on who is asking.
 * `cookies()` already forces a dynamic render; the export says so out loud so
 * nobody adds a revalidate here later and starts serving one person's page to
 * the next.
 */
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  'link-invalid': 'That sign-in link did not work. It may have expired or already been used — ask for a new one.',
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const client = createAuthClient(await cookies());
  const userId = await currentUserId(client);

  const errorKey = typeof params.error === 'string' ? params.error : null;
  const deleted = params.deleted === '1';

  if (userId === null) {
    return (
      <>
        <h1>Your account</h1>
        <p className={styles.lede}>
          An account saves your calculator answers so you can come back to them, and keeps a history
          of what you have scored over time.
        </p>

        {deleted ? (
          <p className={styles.privacy} role="status">
            Your account and everything in it has been deleted.
          </p>
        ) : null}

        {errorKey === null ? null : (
          <p className={styles.inlineWarning} role="status">{MESSAGES[errorKey] ?? MESSAGES['link-invalid']}</p>
        )}

        <SignInForm />

        <h2>What an account stores</h2>
        <p>
          Only the answers you choose to save, and the score each save produced. Nothing else — no
          name, no tracking, no analytics anywhere on this site. Your answers are never shared, and
          you can delete the account and everything in it at any time, from this page.
        </p>
        <p className={styles.muted}>
          Without an account the <Link href="/calculator">calculator</Link> works exactly the same.
          It simply forgets your answers when you close the tab.
        </p>
      </>
    );
  }

  const saved = await fetchSavedProfile(client, userId);

  return (
    <>
      <h1>Your account</h1>
      <p className={styles.lede}>You are signed in.</p>

      <section className={styles.card}>
        <h2>Your saved answers</h2>
        {saved === null ? (
          <p>
            You have not saved anything yet. Fill in the{' '}
            <Link href="/calculator">calculator</Link> and choose to save when you are happy with it.
          </p>
        ) : (
          <p>
            Last saved {formatDateTime(saved.updated_at)}. Open the{' '}
            <Link href="/calculator">calculator</Link> to load or update it, or see your{' '}
            <Link href="/history">score history</Link>.
          </p>
        )}
      </section>

      <section className={styles.card}>
        <h2>What this account stores</h2>
        <p>
          The answers you have saved, and the score each save produced. Nothing else — no name, no
          tracking, no analytics. Your answers are never shared with anyone.
        </p>
        <form action={signOut}>
          <button type="submit" className={styles.reset}>Sign out</button>
        </form>
      </section>

      <section className={styles.card}>
        <h2>Delete this account</h2>
        <DeleteAccount />
      </section>
    </>
  );
}
