import { beforeEach, describe, expect, it } from 'vitest';
import { readOnboardingDraft } from '@/components/onboarding/use-onboarding-draft';
import { seedOnboardingDraft } from './guide-onboarding-seed';

const YEAR_TWO = { key: 'bacalorya:2', systemSlug: 'bacalorya', year: 2, label: 'الصف الثاني بكالوريا' };

/**
 * The seed writes; the wizard's OWN reader reads. The two files spell the
 * storage key separately (see the seed's header for why), so this round trip
 * is the only thing that fails when one of them is renamed.
 */
describe('handing the guide’s answers to the onboarding wizard', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('opens the wizard with the year and the stream already filled', () => {
    seedOnboardingDraft({ year: YEAR_TWO, stream: 'languages', includeYear: true });
    expect(readOnboardingDraft()).toMatchObject({ year: 2, schoolStream: 'languages' });
  });

  it('keeps what the visitor had already typed into the wizard', () => {
    window.sessionStorage.setItem(
      'onboarding-draft',
      JSON.stringify({ fullName: 'مريم أحمد علي', schoolName: 'مدرسة النصر', year: 1 }),
    );
    seedOnboardingDraft({ year: YEAR_TWO, stream: 'general', includeYear: true });
    expect(readOnboardingDraft()).toMatchObject({
      fullName: 'مريم أحمد علي',
      schoolName: 'مدرسة النصر',
      year: 2,
      schoolStream: 'general',
    });
  });

  it('leaves the year out when the wizard could not show it', () => {
    seedOnboardingDraft({ year: { ...YEAR_TWO, year: 3 }, stream: 'general', includeYear: false });
    const draft = readOnboardingDraft();
    expect(draft.year).toBeUndefined();
    expect(draft.schoolStream).toBe('general');
  });

  it('writes nothing it was not given', () => {
    seedOnboardingDraft({ year: null, stream: null, includeYear: true });
    expect(readOnboardingDraft()).toEqual({});
  });

  it('survives a corrupt draft and a missing storage', () => {
    window.sessionStorage.setItem('onboarding-draft', '{oops');
    expect(() => seedOnboardingDraft({ year: YEAR_TWO, stream: 'general', includeYear: true })).not.toThrow();
    expect(() =>
      seedOnboardingDraft({ year: YEAR_TWO, stream: 'general', includeYear: true }, undefined),
    ).not.toThrow();
  });
});
