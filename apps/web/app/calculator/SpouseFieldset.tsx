'use client';

/**
 * The accompanying spouse or common-law partner.
 *
 * The spouse chooses their own first official language, independently of the
 * applicant - IRCC asks it as a separate question, and deriving it from the
 * applicant scored a spouse with a perfect test in the other language zero.
 * See the note in packages/crs-rules/src/types.ts.
 */
import { educationLevels } from '@maple/crs-rules';
import { EDUCATION_LABELS, OFFICIAL_LANGUAGE_LABELS } from '../../src/profile.ts';
import type { OfficialLanguage } from '../../src/profile.ts';
import type { SpouseForm } from '../../src/profileForm.ts';
import { ChoiceField, NumberField } from './FormFields.tsx';
import { LanguageFieldset } from './LanguageFieldset.tsx';
import styles from '../ui.module.css';

const OFFICIAL_LANGUAGES: readonly OfficialLanguage[] = ['english', 'french'];

export function SpouseFieldset({
  value, onChange,
}: {
  value: SpouseForm;
  onChange: (next: SpouseForm) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>Your accompanying spouse or common-law partner</legend>

      <ChoiceField
        id="spouse-education"
        label="Their highest level of education"
        value={value.educationLevel}
        options={educationLevels}
        labels={EDUCATION_LABELS}
        onChange={(educationLevel) => onChange({ ...value, educationLevel })}
      />

      <NumberField
        id="spouse-canadian-work"
        label="Their years of skilled work experience in Canada"
        value={value.canadianWorkYears}
        hint="Whole years, in the last ten."
        onChange={(canadianWorkYears) => onChange({ ...value, canadianWorkYears })}
      />

      <ChoiceField
        id="spouse-first-language"
        label="Their first official language"
        value={value.firstOfficialLanguage}
        options={OFFICIAL_LANGUAGES}
        labels={OFFICIAL_LANGUAGE_LABELS}
        hint="Asked separately from yours: a couple applying in different languages is ordinary."
        onChange={(firstOfficialLanguage) => onChange({ ...value, firstOfficialLanguage })}
      />

      <LanguageFieldset
        legend="Their English test result"
        idPrefix="spouse-english"
        scaleName="CLB"
        value={value.english}
        onChange={(english) => onChange({ ...value, english })}
      />

      <LanguageFieldset
        legend="Their French test result"
        idPrefix="spouse-french"
        scaleName="NCLC"
        value={value.french}
        onChange={(french) => onChange({ ...value, french })}
      />
    </fieldset>
  );
}
