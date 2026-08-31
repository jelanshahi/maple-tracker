'use client';

/**
 * Save and load, for signed-in users only.
 *
 * This is the one control on the calculator that sends anything anywhere, and
 * it only does so when pressed. Signed out, the component is not rendered at
 * all and the page behaves exactly as it did before accounts existed.
 *
 * It calls Server Actions rather than the network directly - this file cannot
 * reach Supabase or fetch, which boundaries.test.ts asserts of every client
 * component here.
 */
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toForm, toProfile } from '../../src/profileMapping.ts';
import type { ProfileForm } from '../../src/profileForm.ts';
import { loadSavedProfile, saveCurrentProfile } from './actions.ts';
import styles from '../ui.module.css';

export function SaveProfile({
  form, onLoad,
}: {
  form: ProfileForm;
  onLoad: (next: ProfileForm) => void;
}) {
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const report = (text: string, isError: boolean) => {
    setMessage(text);
    setFailed(isError);
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveCurrentProfile(toProfile(form));
      report(result.message, result.status === 'error');
    });
  };

  const load = () => {
    startTransition(async () => {
      const result = await loadSavedProfile();
      if (result.status === 'loaded') {
        onLoad(toForm(result.profile));
        report('Your saved answers are back.', false);
        return;
      }
      report(result.message, result.status === 'error');
    });
  };

  return (
    <section className={styles.card} aria-labelledby="save-heading">
      <h2 id="save-heading">Save to your account</h2>
      <p className={styles.muted}>
        Saving sends these answers to your account so you can come back to them, and records the
        score in your <Link href="/history">history</Link>. Nothing is sent until you press save.
        You need to be <Link href="/account">signed in</Link> — it takes one email and no password.
      </p>
      <p className={styles.actions}>
        <button type="button" className={styles.reset} onClick={save} disabled={pending}>
          {pending ? 'Working…' : 'Save my answers'}
        </button>
        <button type="button" className={styles.reset} onClick={load} disabled={pending}>
          Load saved answers
        </button>
      </p>
      {message === '' ? null : (
        <p className={failed ? styles.inlineWarning : styles.privacy} role="status">{message}</p>
      )}
    </section>
  );
}
