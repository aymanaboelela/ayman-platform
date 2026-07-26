const STORAGE_KEY = 'ayman:onboarding:parentPhonesSkippedAt';

/**
 * Records that the student explicitly skipped the optional parent-phone
 * fields during onboarding, so a future "re-prompt at day 7" feature (§5.2)
 * can tell "asked and declined" apart from "never asked". There is no
 * backend column for this yet — `StudentProfile` only has nullable
 * `fatherPhone`/`motherPhone`, and adding one is `apps/api` schema/migration
 * work outside this task's file scope — so this is kept client-side for now.
 * `typeof window` guards let this run safely during SSR/prerendering.
 */
export function recordParentPhonesSkipped(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

export function getParentPhonesSkippedAt(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}
