'use client';

/**
 * Every question the calculator asks about the applicant, grouped the way IRCC
 * groups them. Split from CalculatorForm so that file keeps one job - holding
 * the state and showing the result - and this one keeps the other.
 *
 * There is deliberately no job-offer question. Arranged employment was removed
 * on 25 March 2025 and crs-current awards it nothing, so the field would look
 * like it mattered and do nothing. See CLAUDE.md.
 */
import { canadianEducationCredentials, educationLevels } from '@maple/crs-rules';
import { CANADIAN_EDUCATION_LABELS, EDUCATION_LABELS, OFFICIAL_LANGUAGE_LABELS } from '../../src/profile.ts';
import type { OfficialLanguage } from '../../src/profile.ts';
import type { ProfileForm } from '../../src/profileForm.ts';
import { ChoiceField, NumberField, YesNoField } from './FormFields.tsx';
import { LanguageFieldset } from './LanguageFieldset.tsx';
import styles from '../ui.module.css';

const OFFICIAL_LANGUAGES: readonly OfficialLanguage[] = ['english', 'french'];

export function ApplicantFieldsets({
  form,
  onChange,
}: {
  form: ProfileForm;
  onChange: (next: ProfileForm) => void;
}) {
  return (
    <>
      <fieldset className={styles.fieldset}>
        <legend>You</legend>
        <NumberField
          id="age"
          label="Your age"
          value={form.age}
          hint="Your age on the day you would be invited."
          onChange={(age) => onChange({ ...form, age })}
        />
        <ChoiceField
          id="education"
          label="Your highest level of education"
          value={form.educationLevel}
          options={educationLevels}
          labels={EDUCATION_LABELS}
          hint="A credential from outside Canada needs an Educational Credential Assessment to count."
          onChange={(educationLevel) => onChange({ ...form, educationLevel })}
        />
        <YesNoField
          id="certificate"
          label="Do you hold a Canadian certificate of qualification in a skilled trade?"
          value={form.hasCertificateOfQualification}
          hint="Issued by a province, territory or federal body after a trade assessment."
          onChange={(hasCertificateOfQualification) => onChange({ ...form, hasCertificateOfQualification })}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Language</legend>
        <ChoiceField
          id="first-language"
          label="Your first official language"
          value={form.firstOfficialLanguage}
          options={OFFICIAL_LANGUAGES}
          labels={OFFICIAL_LANGUAGE_LABELS}
          hint="The one you scored higher in. Nothing is assumed if you leave this blank."
          onChange={(firstOfficialLanguage) => onChange({ ...form, firstOfficialLanguage })}
        />
        <LanguageFieldset
          legend="Your English test result"
          idPrefix="english"
          scaleName="CLB"
          value={form.english}
          onChange={(english) => onChange({ ...form, english })}
        />
        <LanguageFieldset
          legend="Your French test result"
          idPrefix="french"
          scaleName="NCLC"
          value={form.french}
          onChange={(french) => onChange({ ...form, french })}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Work and study</legend>
        <NumberField
          id="canadian-work"
          label="Years of skilled work experience in Canada"
          value={form.canadianWorkYears}
          hint="Whole years, in the last ten."
          onChange={(canadianWorkYears) => onChange({ ...form, canadianWorkYears })}
        />
        <NumberField
          id="foreign-work"
          label="Years of skilled work experience outside Canada"
          value={form.foreignWorkYears}
          hint="Whole years, in the last ten."
          onChange={(foreignWorkYears) => onChange({ ...form, foreignWorkYears })}
        />
        <ChoiceField
          id="canadian-education"
          label="Post-secondary education completed in Canada"
          value={form.canadianEducationCredential}
          options={canadianEducationCredentials}
          labels={CANADIAN_EDUCATION_LABELS}
          onChange={(canadianEducationCredential) => onChange({ ...form, canadianEducationCredential })}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Additional points</legend>
        <YesNoField
          id="nomination"
          label="Do you hold a provincial or territorial nomination?"
          value={form.provincialNomination}
          hint="Worth 600 points on its own."
          onChange={(provincialNomination) => onChange({ ...form, provincialNomination })}
        />
        <YesNoField
          id="sibling"
          label="Do you have a sibling in Canada who is a citizen or permanent resident?"
          value={form.siblingInCanada}
          onChange={(siblingInCanada) => onChange({ ...form, siblingInCanada })}
        />
        <p className={styles.field}>
          {/* Input and label are siblings associated by htmlFor, rather than the
              label wrapping the input. One association, stated once - the two
              patterns behave the same, and this is the one that cannot be read
              as associating them twice. */}
          <span className={styles.checkboxLabel}>
            <input
              id="spouse-accompanying"
              type="checkbox"
              checked={form.hasAccompanyingSpouse}
              onChange={(event) => onChange({ ...form, hasAccompanyingSpouse: event.target.checked })}
            />
            <label htmlFor="spouse-accompanying">A spouse or common-law partner is coming with me</label>
          </span>
          <span className={styles.hint}>
            Leave this unticked if you are single, or if your partner is not coming. Either way the
            single-applicant columns apply.
          </span>
        </p>
      </fieldset>
    </>
  );
}
