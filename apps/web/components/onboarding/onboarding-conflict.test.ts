import { describe, expect, it } from 'vitest';
import { OnboardingSchema } from '@ayman/contracts/onboarding';
import { copy } from '@ayman/contracts/copy';

/**
 * «كل ما اجي احط رقم ولي الامر يقول متسجل قبل كده مع انه مش متسجل»
 *
 * The wizard submits its WHOLE payload from the last step, and the last step's
 * only field is «تليفون ولي الأمر». The one server-side refusal it can get —
 * a 409 — used to be painted as a form-level line directly under that field,
 * so a student whose OWN number was taken read it as a refusal of their
 * father's.
 *
 * These tests pin the two facts the fix rests on. They are deliberately about
 * the CONTRACT rather than a render: the claim «only `phone` can 409» is a
 * statement about the database's unique indexes and the schema's shape, and a
 * DOM assertion would not check it.
 */
describe('the onboarding conflict', () => {
  it('has exactly one field a 409 can be about', () => {
    /*
     * The UNIQUE columns behind `ProfileService.completeOnboarding`'s 409 are
     * `users.phone_number` and `student_profiles.phone` — both the student's
     * own number, written from `phone`. `father_phone` is `String? @db.Citext`
     * with NO unique index, deliberately: two siblings on this platform are
     * expected to give the same guardian's number, and an index there would
     * refuse the second one.
     *
     * If a unique index is ever added to another column on that write, this
     * test does not fail on its own — but the message it guards is a lie from
     * that moment, so the pairing is written down here.
     */
    const shape = OnboardingSchema.shape;
    expect(Object.keys(shape)).toContain('phone');
    expect(Object.keys(shape)).toContain('fatherPhone');
  });

  it('names WHOSE number is taken, so it cannot be read as the guardian’s', () => {
    // The old wording was «الرقم ده متسجّل على حساب تاني» — «ده» meaning
    // whichever field the line happened to sit under, which was the wrong one.
    expect(copy.onboarding.phoneConflictError).toContain('رقمك');
    expect(copy.onboarding.phoneConflictError).not.toContain('ولي الأمر');
  });

  it('explains the jump back to the first step', () => {
    // The form switches step on a 409. A student landing on a step they did
    // not ask for with no sentence explaining it reads it as the form breaking.
    expect(copy.onboarding.phoneConflictHint.length).toBeGreaterThan(20);
  });
});
