'use client';

/**
 * The calculator. Everything here runs in the browser and stays there.
 *
 * score() is pure and synchronous, so scoring costs nothing to do on the
 * client - which means the profile never crosses the network, never reaches a
 * server log and never reaches the database. That is the whole reason this is a
 * client component rather than a form that posts somewhere. A Profile is
 * personal information under PIPEDA, Law 25 and GDPR, and
 * apps/web/test/boundaries.test.ts asserts that no client component can reach
 * the network or the Supabase client, so the promise is checked rather than
 * merely described.
 *
 * Nothing is persisted on its own. Signed out, a refresh clears everything and
 * the answers never leave the page. Signed in, the save control below is the
 * only thing that sends them anywhere, and only when pressed.
 */
import { crsCurrent, score } from '@maple/crs-rules';
import { useState } from 'react';
import type { CutoffMark } from '../../src/gap.ts';
import { emptyForm } from '../../src/profileForm.ts';
import { toProfile } from '../../src/profileMapping.ts';
import { ApplicantFieldsets } from './ApplicantFieldsets.tsx';
import { CutoffGap } from './CutoffGap.tsx';
import { SaveProfile } from './SaveProfile.tsx';
import { ScoreBreakdown } from './ScoreBreakdown.tsx';
import { SpouseFieldset } from './SpouseFieldset.tsx';
import styles from '../ui.module.css';

export function CalculatorForm({ cutoffs }: { cutoffs: readonly CutoffMark[] }) {
  const [form, setForm] = useState(emptyForm);
  const result = score(toProfile(form), crsCurrent);

  return (
    <div className={styles.calculator}>
      {/* The score is recomputed as you type and there is nowhere to submit it
          to, so the only job of onSubmit is to stop a stray Enter navigating. */}
      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <ApplicantFieldsets form={form} onChange={setForm} />

        {form.hasAccompanyingSpouse ? (
          <SpouseFieldset value={form.spouse} onChange={(spouse) => setForm({ ...form, spouse })} />
        ) : null}

        <p>
          <button type="button" className={styles.reset} onClick={() => setForm(emptyForm())}>
            Clear every answer
          </button>
        </p>
      </form>

      <div className={styles.results}>
        <ScoreBreakdown result={result} ruleSet={crsCurrent} />
        <SaveProfile form={form} onLoad={setForm} />
        <CutoffGap total={result.total} cutoffs={cutoffs} />
      </div>
    </div>
  );
}
