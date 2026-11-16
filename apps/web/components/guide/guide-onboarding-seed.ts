import type { Stream, YearOption } from './guide-options';

/**
 * The guide's year and stream, handed to the onboarding wizard so it does not
 * ask for them again.
 *
 * A visitor answers «which year?» and «عربي ولا لغات؟» in the guide, creates
 * an account, and lands on `/onboarding` — which asks both. The wizard already
 * restores a draft from `sessionStorage` when it is built
 * (`readOnboardingDraft` in `components/onboarding/use-onboarding-draft.ts`),
 * so the two answers are written into that same draft before the walk to the
 * register page, and the wizard opens with them filled. The student still
 * sees them and still submits them: they reach the profile through the
 * wizard's own save and its own validation, not through a side door.
 *
 * ## Why the key is spelled here and not imported
 *
 * `use-onboarding-draft.ts` does not export it, and adding an export to a
 * module that is already in the client graph is the Turbopack trap in
 * `docs/agents/pitfalls.md`: a tab left open across the deploy keeps that
 * file's old factory and reads the new export as `undefined`. So the string
 * is repeated, and `guide-onboarding-seed.test.ts` writes through this
 * function and reads back through the wizard's own reader — if either side
 * renames the key, that test is what fails.
 */
const ONBOARDING_DRAFT_KEY = 'onboarding-draft';

export function seedOnboardingDraft(
  answers: { year: YearOption | null; stream: Stream | null; includeYear: boolean },
  storage: Storage | undefined = safeSession(),
): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(ONBOARDING_DRAFT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    // Merge, never replace: a visitor who started the wizard earlier in this
    // tab has a draft with a name and a school in it.
    const draft: Record<string, unknown> =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...(parsed as object) } : {};

    if (answers.year && answers.includeYear) {
      draft.year = answers.year.year;
      // Read only on a stack whose wizard asks the system; ignored elsewhere
      // (`DRAFT_FIELDS` filters what is restored).
      draft.system = answers.year.systemSlug;
    }
    if (answers.stream) draft.schoolStream = answers.stream;

    storage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // No draft is the wizard exactly as it was before the guide existed.
  }
}

function safeSession(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
