import { afterEach, describe, expect, it } from 'vitest';
import { clearOnboardingDraft, readOnboardingDraft } from './use-onboarding-draft';

/**
 * The draft is what let `/privacy` stop opening in a new tab — see the hook's
 * own docblock for why that mattered. These cases are about the two properties
 * that make it safe to spread into `defaultValues`.
 *
 * ⚠️ They assert the EFFECT, not the mechanism. Every one of them goes through
 * the real `sessionStorage` that jsdom provides, so a rewrite that swapped the
 * storage layer would still be held to the same answers.
 */
const KEY = 'onboarding-draft';

function write(value: unknown): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(value));
}

afterEach(() => {
  window.sessionStorage.clear();
});

describe('readOnboardingDraft', () => {
  it('restores what the student typed', () => {
    write({ fullName: 'سلمى محمد', phone: '01012345678', year: 2 });
    expect(readOnboardingDraft()).toEqual({
      fullName: 'سلمى محمد',
      phone: '01012345678',
      year: 2,
    });
  });

  it('is empty when nothing has been typed, so a first visit reads the account', () => {
    expect(readOnboardingDraft()).toEqual({});
  });

  /**
   * The trust boundary. `system`, `trackId` and `electiveSubjectId` are the
   * three answers the form never asks for — `fixedSectionFor` fills them on
   * submit from the taxonomy. A draft that could carry them would let anyone
   * who can edit `sessionStorage` choose a student's track, and the request
   * would look entirely ordinary on the way out.
   */
  it('drops the three fields the wizard never asks for', () => {
    write({
      fullName: 'سلمى',
      system: 'thanaweya_amma',
      trackId: 'not-a-track-this-student-picked',
      electiveSubjectId: 'nope',
    });
    expect(readOnboardingDraft()).toEqual({ fullName: 'سلمى' });
  });

  /**
   * Not a security case — `OnboardingSchema` would reject any of these on
   * submit. It is a RENDER case: an object handed to an uncontrolled `<input
   * value>` paints `[object Object]` into a field the student then cannot
   * clear, on the one screen they cannot skip.
   */
  it.each([
    ['an object', { fullName: { toString: 'boom' } }],
    ['an array', { fullName: ['a', 'b'] }],
    ['null', { fullName: null }],
    ['a boolean', { fullName: true }],
  ])('drops %s in a field that must render as text', (_label, stored) => {
    write(stored);
    expect(readOnboardingDraft()).toEqual({});
  });

  it.each([
    ['a corrupt value', 'not json at all'],
    ['a JSON array', '["fullName"]'],
    ['a JSON string', '"fullName"'],
    ['JSON null', 'null'],
  ])('returns nothing rather than throwing for %s', (_label, raw) => {
    window.sessionStorage.setItem(KEY, raw);
    expect(readOnboardingDraft()).toEqual({});
  });
});

describe('clearOnboardingDraft', () => {
  /**
   * Called the moment onboarding succeeds. Waiting for the tab to close would
   * leave a full name and two phone numbers readable for the rest of the
   * session on a school or shared computer — which is most of this audience.
   */
  it('removes the answers once the profile is written', () => {
    write({ fullName: 'سلمى', phone: '01012345678' });
    clearOnboardingDraft();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(readOnboardingDraft()).toEqual({});
  });

  it('is safe to call when there is nothing stored', () => {
    expect(() => clearOnboardingDraft()).not.toThrow();
  });
});
