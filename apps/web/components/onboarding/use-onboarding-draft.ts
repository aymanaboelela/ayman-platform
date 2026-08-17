'use client';

import { useEffect } from 'react';
import type { UseFormWatch } from 'react-hook-form';
import type { Onboarding } from '@ayman/contracts/onboarding';

/**
 * The onboarding wizard's answers, kept alive across ONE navigation away and
 * back.
 *
 * ## The dead end this exists to remove
 *
 * The privacy link under the form used to carry `target="_blank"`, and the
 * comment on it was honest about why: «this form holds four steps of unsaved
 * input and there is no draft», so following the link in place would have
 * thrown all of it away. What that bought in one tab it lost in the other —
 * a new tab starts with no history, so the back gesture does nothing, and the
 * legal page's only way out was a link at the very bottom of a long document
 * pointing at the marketing home page. Reported exactly that way: «دخلت على
 * سياسة الخصوصية من تحت، أنا مش قادر إن أنا أرجع».
 *
 * With a draft the trade disappears. The link is an ordinary same-tab
 * navigation, back works because it is real history, and the form the student
 * comes back to is the form they left.
 *
 * ## Why `sessionStorage` and not `localStorage`
 *
 * This is a phone number, a full name and a school — the most sensitive
 * payload any form in the product collects. `sessionStorage` is scoped to the
 * one tab and is gone when it closes, which is the shortest life that still
 * survives a navigation. `localStorage` would leave that data on a shared or
 * school computer indefinitely, for a convenience measured in seconds.
 *
 * It is also cleared explicitly the moment onboarding succeeds — see
 * `clearOnboardingDraft`. Waiting for the tab to close would leave the values
 * readable for the whole session on a machine the student has walked away from.
 *
 * ## Why the read is a plain function and not part of the hook
 *
 * `defaultValues` is consumed by `useForm` before any effect runs, so the
 * restore has to happen while the component is being constructed rather than
 * after it has mounted. Splitting the read out keeps that possible and keeps
 * this file free of the `reset()`-on-mount flicker the alternative needs.
 */
const DRAFT_KEY = 'onboarding-draft';

/**
 * The keys a draft may restore. Spelled out rather than derived, because this
 * is a trust boundary: the three the form never asks for (`system`, `trackId`,
 * `electiveSubjectId`) are filled by `fixedSectionFor` on submit, and a draft
 * that could set them would let a hand-edited `sessionStorage` value choose a
 * student's track. `.strict()` on the schema would reject the payload rather
 * than obey it, so this is defence in depth — but it is one line of it.
 */
const DRAFT_FIELDS = [
  'fullName',
  'gender',
  'phone',
  'governorateCode',
  'schoolName',
  'schoolStream',
  'year',
  'fatherPhone',
] as const satisfies ReadonlyArray<keyof Onboarding>;

/**
 * Whatever was last typed, or `{}`.
 *
 * ## What this is NOT
 *
 * It is not validated, and it is deliberately not typed as though it were.
 * Every value goes to `defaultValues`, and `OnboardingSchema` runs over all of
 * it on submit exactly as it does for anything typed by hand — so the worst a
 * tampered draft can produce is the same Arabic validation error an empty
 * field produces. What the filter below removes is the class of value that
 * would break the FORM rather than fail validation: an object or an array in a
 * `<input value>` renders as `[object Object]` and cannot be cleared.
 *
 * Every failure mode returns `{}` rather than throwing: `sessionStorage` is
 * absent during SSR and unavailable outright in a browser with site data
 * blocked, and a corrupt value is not worth a crash on the one screen a
 * student cannot skip. A lost draft costs a re-type; a thrown error costs the
 * account.
 */
export function readOnboardingDraft(): Partial<Onboarding> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const source = parsed as Record<string, unknown>;
    const draft: Record<string, string | number> = {};
    for (const field of DRAFT_FIELDS) {
      const value = source[field];
      if (typeof value === 'string' || typeof value === 'number') draft[field] = value;
    }
    return draft as Partial<Onboarding>;
  } catch {
    return {};
  }
}

export function clearOnboardingDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* Same reasoning as the read: storage being unavailable is not an error
       worth surfacing on this screen. Nothing was written, so nothing leaks. */
  }
}

/**
 * Mirrors every keystroke into the draft.
 *
 * `watch` with a callback subscribes to react-hook-form's own change stream
 * rather than re-rendering this component per character, which is what
 * `watch()` with no arguments would do — on a wizard whose fields are all
 * mounted at once, that is the whole form re-rendering on every letter of a
 * school name.
 */
export function useOnboardingDraft(watch: UseFormWatch<Onboarding>): void {
  useEffect(() => {
    const subscription = watch((values) => {
      try {
        window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
      } catch {
        /* Quota or blocked storage. The form still works; only the draft is lost. */
      }
    });
    return () => subscription.unsubscribe();
  }, [watch]);
}
