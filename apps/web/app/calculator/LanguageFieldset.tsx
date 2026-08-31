'use client';

/**
 * One language test, as four abilities.
 *
 * ARCHITECTURE.md section 6: the engine takes four abilities and never one
 * aggregate, because core language points are awarded per ability - 9/9/9/7 and
 * 7/7/7/7 do not score the same. The "set all four" control below is a typing
 * shortcut only; the four values stay independent in state, so a shortcut can
 * never become the only input.
 *
 * Used four times: the applicant's English and French, and the spouse's.
 */
import { CLB_LEVELS, clbLabel } from '../../src/profile.ts';
import { LANGUAGE_ABILITIES, isPartlyFilled } from '../../src/profileForm.ts';
import type { LanguageAbility, LanguageForm } from '../../src/profileForm.ts';
import styles from '../ui.module.css';

const ABILITY_LABELS: Record<LanguageAbility, string> = {
  reading: 'Reading',
  writing: 'Writing',
  listening: 'Listening',
  speaking: 'Speaking',
};

function parseLevel(value: string): number | null {
  return CLB_LEVELS.find((level) => String(level) === value) ?? null;
}

export function LanguageFieldset({
  legend, idPrefix, scaleName, value, onChange,
}: {
  legend: string;
  idPrefix: string;
  /** CLB for English, NCLC for French - IRCC names the two scales differently. */
  scaleName: string;
  value: LanguageForm;
  onChange: (next: LanguageForm) => void;
}) {
  const setAll = (level: number | null) => {
    onChange({ reading: level, writing: level, listening: level, speaking: level });
  };

  return (
    <fieldset className={styles.subFieldset}>
      <legend>{legend}</legend>

      <div className={styles.abilities}>
        {LANGUAGE_ABILITIES.map((ability) => {
          const id = `${idPrefix}-${ability}`;
          return (
            <p key={ability} className={styles.field}>
              <label htmlFor={id}>{ABILITY_LABELS[ability]}</label>
              <select
                id={id}
                value={value[ability] === null ? '' : String(value[ability])}
                onChange={(event) => onChange({ ...value, [ability]: parseLevel(event.target.value) })}
              >
                <option value="">Not answered</option>
                {CLB_LEVELS.map((level) => (
                  <option key={level} value={level}>{`${scaleName} ${clbLabel(level)}`}</option>
                ))}
              </select>
            </p>
          );
        })}
      </div>

      <p className={styles.field}>
        <label htmlFor={`${idPrefix}-all`}>Set all four at once</label>
        <select
          id={`${idPrefix}-all`}
          value=""
          onChange={(event) => setAll(parseLevel(event.target.value))}
        >
          <option value="">Choose a level&hellip;</option>
          {CLB_LEVELS.map((level) => (
            <option key={level} value={level}>{`${scaleName} ${clbLabel(level)}`}</option>
          ))}
        </select>
        <span className={styles.hint}>
          A shortcut for typing. The four abilities are scored separately either way.
        </span>
      </p>

      {isPartlyFilled(value) ? (
        <p className={styles.inlineWarning}>
          All four abilities are needed before this test can be scored. Until then it counts as
          no test result at all.
        </p>
      ) : null}
    </fieldset>
  );
}
