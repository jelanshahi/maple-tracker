'use client';

/**
 * The sign-in form. One field, one button.
 *
 * The email goes to a Server Action, not to Supabase - this component cannot
 * reach the network itself, which is what apps/web/test/boundaries.test.ts
 * asserts about every client component in the app.
 */
import { useActionState } from 'react';
import { signIn } from './actions.ts';
import type { SignInState } from './actions.ts';
import styles from '../ui.module.css';

const IDLE: SignInState = { status: 'idle', message: '' };

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, IDLE);

  return (
    <form action={action} className={styles.form}>
      <p className={styles.field}>
        <label htmlFor="email">Your email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
        />
        <span className={styles.hint}>
          We email you a link that signs you in. There is no password to choose or forget.
        </span>
      </p>

      <p>
        <button type="submit" className={styles.reset} disabled={pending}>
          {pending ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </p>

      {state.status === 'idle' ? null : (
        <p className={state.status === 'error' ? styles.inlineWarning : styles.privacy} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
