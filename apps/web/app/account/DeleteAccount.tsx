'use client';

/**
 * Deleting an account, behind a typed confirmation.
 *
 * Erasure is a right under PIPEDA, Law 25 and GDPR, so this exists and is not
 * buried. It is also irreversible and cascades to the saved profile and the
 * whole score history, so it asks the person to type the word rather than to
 * click once - a confirm dialog would block the page and be dismissed by habit.
 */
import { useState } from 'react';
import { deleteAccount } from './actions.ts';
import styles from '../ui.module.css';

const CONFIRMATION = 'delete';

export function DeleteAccount() {
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim().toLowerCase() === CONFIRMATION;

  return (
    <form action={deleteAccount} className={styles.form}>
      <p>
        This removes your account, your saved answers and your whole score history. It cannot be
        undone, and nothing is kept.
      </p>
      <p className={styles.field}>
        <label htmlFor="confirm-delete">
          Type <strong>{CONFIRMATION}</strong> to confirm
        </label>
        <input
          id="confirm-delete"
          type="text"
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </p>
      <p>
        <button type="submit" className={styles.danger} disabled={!confirmed}>
          Delete my account
        </button>
      </p>
    </form>
  );
}
