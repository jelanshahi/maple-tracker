/**
 * The same profile scored again with one answer changed.
 *
 * Arithmetic, and nothing beyond it. CLAUDE.md forbids immigration advice and
 * cites IRPA s.91 as a legal boundary rather than an editorial preference, so a
 * row here reports what the rule set produces for a changed input and stops. It
 * never ranks a change as worth making, never says a change would clear a
 * cut-off, and never describes a route through the system. The reader draws
 * their own conclusion; gap.ts keeps the same voice for the same reason.
 *
 * No points value is written down. Every delta comes back out of score(), which
 * is what keeps CLAUDE.md's "never hardcode a points value" rule true here, and
 * it hands us the section caps and the skill-transferability grids for free: a
 * change worth 50 on paper that lands against the core cap reports its real net
 * rather than its headline.
 *
 * Pure - no React, no I/O, and the profile it is handed is never mutated.
 */
import { educationLevels, score } from '@maple/crs-rules';
import type { LanguageTest, Profile, RuleSet } from '@maple/crs-rules';
import { CANADIAN_EDUCATION_LABELS, EDUCATION_LABELS, clbLabel } from './profile.ts';
import type { EducationLevel } from './profile.ts';

export type LeverGroup = 'language' | 'work' | 'education' | 'spouse' | 'nomination';

type SpouseProfile = NonNullable<Profile['spouse']>;

type Lever = {
  key: string;
  group: LeverGroup;
  label: string;
  apply: (profile: Profile) => Profile;
  /** Rendered beside the row, where the change needs qualifying. */
  note?: string;
};

export type LeverResult = {
  key: string;
  group: LeverGroup;
  label: string;
  /** Always positive: a change that does not raise the total gets no row. */
  delta: number;
  total: number;
  note?: string;
};

export const NOMINATION_LEVER_KEY = 'provincial-nomination';

/**
 * A nomination is worth more than every other row put together, so sorting by
 * size would pin it to the top of every reader's panel for ever. That reads as
 * "go and get one", which is advice, and it misdescribes a separate competitive
 * application to a province as a score adjustment. Hence the pin and the note.
 */
const NOMINATION_NOTE =
  'A nomination is granted by a province under its own programme and its own criteria.'
  + ' It is not a score adjustment; it is a separate application.';

const GROUP_ORDER: readonly LeverGroup[] = ['language', 'work', 'education', 'spouse'];

/**
 * One level across all four abilities. The rule set bands on the lowest
 * ability, so uneven results are what a real test produces but not what a
 * readable row is: three steps per language, not eleven.
 */
const allFour = (level: number): LanguageTest =>
  ({ reading: level, writing: level, listening: level, speaking: level });

const yearsOf = (count: number) => (count === 1 ? '1 year' : `${count} years`);

/** Nothing held means every level is above it. */
const levelsAbove = (held: EducationLevel | null): readonly EducationLevel[] =>
  educationLevels.slice(held === null ? 0 : educationLevels.indexOf(held) + 1);

function languageLevers(): Lever[] {
  return [
    ...[5, 7, 9].map((level) => ({
      key: `french-clb-${level}`,
      group: 'language' as const,
      label: `French at NCLC ${clbLabel(level)} in all four abilities`,
      apply: (profile: Profile) => ({ ...profile, french: allFour(level) }),
    })),
    ...[7, 9, 10].map((level) => ({
      key: `english-clb-${level}`,
      group: 'language' as const,
      label: `English at CLB ${clbLabel(level)} in all four abilities`,
      apply: (profile: Profile) => ({ ...profile, english: allFour(level) }),
    })),
  ];
}

function workLevers(): Lever[] {
  return [
    ...[1, 3, 5].map((count) => ({
      key: `canadian-work-${count}`,
      group: 'work' as const,
      label: `${yearsOf(count)} of skilled work experience in Canada`,
      apply: (profile: Profile) => ({ ...profile, canadianWorkYears: count }),
    })),
    ...[1, 2, 3].map((count) => ({
      key: `foreign-work-${count}`,
      group: 'work' as const,
      label: `${yearsOf(count)} of skilled work experience outside Canada`,
      apply: (profile: Profile) => ({ ...profile, foreignWorkYears: count }),
    })),
  ];
}

function educationLevers(held: EducationLevel | null): Lever[] {
  return [
    ...levelsAbove(held).map((level) => ({
      key: `education-${level}`,
      group: 'education' as const,
      label: EDUCATION_LABELS[level],
      apply: (profile: Profile) => ({ ...profile, educationLevel: level }),
    })),
    ...(['one-or-two-years', 'three-years-or-more'] as const).map((credential) => ({
      key: `canadian-education-${credential}`,
      group: 'education' as const,
      label: CANADIAN_EDUCATION_LABELS[credential],
      apply: (profile: Profile) => ({ ...profile, canadianEducationCredential: credential }),
    })),
    {
      key: 'certificate-of-qualification',
      group: 'education' as const,
      label: 'A certificate of qualification in a skilled trade, from a province or territory',
      apply: (profile: Profile) => ({ ...profile, hasCertificateOfQualification: true }),
    },
  ];
}

function spouseLevers(spouse: SpouseProfile): Lever[] {
  const changing = (change: Partial<SpouseProfile>) =>
    (profile: Profile) => ({ ...profile, spouse: { ...spouse, ...change } });

  return [
    ...[7, 9].map((level) => ({
      key: `spouse-english-clb-${level}`,
      group: 'spouse' as const,
      label: `English at CLB ${clbLabel(level)} in all four abilities, for the accompanying spouse`,
      apply: changing({ english: allFour(level) }),
    })),
    ...levelsAbove(spouse.educationLevel).map((level) => ({
      key: `spouse-education-${level}`,
      group: 'spouse' as const,
      label: `${EDUCATION_LABELS[level]}, for the accompanying spouse`,
      apply: changing({ educationLevel: level }),
    })),
    ...[1, 3].map((count) => ({
      key: `spouse-canadian-work-${count}`,
      group: 'spouse' as const,
      label: `${yearsOf(count)} of skilled work experience in Canada, for the accompanying spouse`,
      apply: changing({ canadianWorkYears: count }),
    })),
  ];
}

function catalogueFor(profile: Profile): Lever[] {
  const spouse = profile.hasAccompanyingSpouse ? profile.spouse : null;
  return [
    ...languageLevers(),
    ...workLevers(),
    ...educationLevers(profile.educationLevel),
    ...(spouse === null ? [] : spouseLevers(spouse)),
    {
      key: NOMINATION_LEVER_KEY,
      group: 'nomination',
      label: 'A provincial or territorial nomination',
      apply: (candidate: Profile) => ({ ...candidate, provincialNomination: true }),
      note: NOMINATION_NOTE,
    },
  ];
}

/**
 * Score the baseline once, then score each changed profile and take the
 * difference. Rows that do not raise the total are dropped, which is what stops
 * "every plausible change" rendering as a wall of zeroes: a profile that has
 * already maxed everything returns nothing at all.
 */
export function leversFor(profile: Profile, ruleSet: RuleSet): LeverResult[] {
  const baseline = score(profile, ruleSet).total;

  const raised = catalogueFor(profile)
    .map(({ key, group, label, apply, note }) => {
      const total = score(apply(profile), ruleSet).total;
      return { key, group, label, delta: total - baseline, total, ...(note === undefined ? {} : { note }) };
    })
    .filter((result) => result.delta > 0);

  const nomination = raised.find((result) => result.key === NOMINATION_LEVER_KEY);
  const rest = raised
    .filter((result) => result.key !== NOMINATION_LEVER_KEY)
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.delta - a.delta);

  return nomination === undefined ? rest : [...rest, nomination];
}
