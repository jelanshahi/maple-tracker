'use client';

/**
 * The three controls the calculator form uses more than twice: a whole-number
 * field, a yes/no that can also be unanswered, and a select over a fixed list
 * of codes. Four, three and five uses respectively - past the third-occurrence
 * line in CLAUDE.md, and the alternative is the same label-and-select markup
 * written twelve times.
 *
 * Every control offers a genuine "not answered" state and starts in it. A
 * pre-selected value would look like the user's answer and score like one.
 */
// Imported rather than inlined so the parsing rule lives in exactly one place.
import { parseCount } from '../../src/profile.ts';
import styles from '../ui.module.css';

const UNANSWERED = '';

export function NumberField({
  id, label, value, hint, onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  hint?: string;
  onChange: (next: number | null) => void;
}) {
  return (
    <p className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value === null ? UNANSWERED : String(value)}
        onChange={(event) => onChange(parseCount(event.target.value))}
      />
      {hint === undefined ? null : <span className={styles.hint}>{hint}</span>}
    </p>
  );
}

export function YesNoField({
  id, label, value, hint, onChange,
}: {
  id: string;
  label: string;
  value: boolean | null;
  hint?: string;
  onChange: (next: boolean | null) => void;
}) {
  const asText = value === null ? UNANSWERED : value ? 'yes' : 'no';
  return (
    <p className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={asText}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === 'yes' ? true : next === 'no' ? false : null);
        }}
      >
        <option value={UNANSWERED}>Not answered</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      {hint === undefined ? null : <span className={styles.hint}>{hint}</span>}
    </p>
  );
}

/**
 * The option list is passed in rather than derived from the label record's
 * keys: it fixes the display order explicitly, and it lets the change handler
 * narrow the selected string by finding it in the list rather than casting it.
 */
export function ChoiceField<T extends string>({
  id, label, value, options, labels, hint, onChange,
}: {
  id: string;
  label: string;
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  hint?: string;
  onChange: (next: T | null) => void;
}) {
  return (
    <p className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value ?? UNANSWERED}
        onChange={(event) => onChange(options.find((option) => option === event.target.value) ?? null)}
      >
        <option value={UNANSWERED}>Not answered</option>
        {options.map((option) => (
          <option key={option} value={option}>{labels[option]}</option>
        ))}
      </select>
      {hint === undefined ? null : <span className={styles.hint}>{hint}</span>}
    </p>
  );
}
