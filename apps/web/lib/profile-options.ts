import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy';
import type { SelectOption } from '@/components/onboarding/select-field';

/**
 * The option lists shared by the onboarding wizard and the profile editor.
 *
 * They lived as module constants inside `onboarding-form.tsx` until the editor
 * needed the same three selects. Copying them would have been two lists of
 * governorates that could fall out of order, and — worse — two spellings of
 * «عام»/«لغات» in a product where the student's answer is matched against a
 * course's badge. One definition, imported twice.
 *
 * A plain module rather than an export from either form: both callers are
 * `'use client'`, but a `'use client'` file cannot export a plain function for
 * a Server Component to call, and putting a shared list behind that rule is
 * how a future server-rendered summary of these values ends up throwing at
 * request time.
 */
export const GENDER_OPTIONS: SelectOption[] = [
  { value: 'male', label: copy.onboarding.genderMale },
  { value: 'female', label: copy.onboarding.genderFemale },
];

/**
 * The same two words the admin ticks on a course and a visitor reads on its
 * badge (`copy.stream`), so a student picking «لغات» here and a course
 * labelled «لغات» there are visibly the same thing. Two options and no
 * «الاتنين»: a course can serve both audiences, a student attends one school.
 */
export const SCHOOL_STREAM_OPTIONS: SelectOption[] = [
  { value: 'general', label: copy.stream.general },
  { value: 'languages', label: copy.stream.languages },
];

/**
 * Every governorate, with the ones the taxonomy pins first.
 *
 * The pinned ones are where the students are; a list of 27 in database order
 * makes the four that matter something to hunt for on a phone.
 */
export function governorateOptions(taxonomy: Taxonomy): SelectOption[] {
  const pinned = taxonomy.pinnedGovernorateCodes
    .map((code) => taxonomy.governorates.find((g) => g.code === code))
    .filter((g): g is Taxonomy['governorates'][number] => g !== undefined);
  const rest = taxonomy.governorates.filter(
    (g) => !taxonomy.pinnedGovernorateCodes.includes(g.code),
  );
  return [...pinned, ...rest].map((g) => ({ value: g.code, label: g.nameAr }));
}
