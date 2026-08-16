import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  QUIZ_DEMO_LESSON_ID,
  enrollInDemoCourse,
  register,
  completeMinimalOnboarding,
  uniqueStudent,
} from './fixtures';

test.describe('signup -> onboarding -> first lesson', () => {
  test('a new student registers, completes onboarding, and reaches a real lesson', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);

    // Registration lands on onboarding, not the dashboard: the profile is empty.
    await expect(page).toHaveURL(/\/onboarding/);
    const { sawWelcome } = await completeMinimalOnboarding(page, student);

    /*
     * The greeting is a real step in this journey, so this test — the one that
     * exists to walk the whole journey — is where it is asserted rather than
     * silently absorbed by the fixture that walks past it.
     *
     * It matters because of how its absence would present. `/welcome` is
     * skipped when no WhatsApp channel is configured, so a settings regression
     * that blanked `contact.whatsappChannel` would make this screen vanish and
     * every other test in the suite still pass — the students would simply stop
     * being asked to join the channel, which is the platform's only way of
     * reaching someone who is not currently on it.
     */
    expect(sawWelcome, 'the post-onboarding greeting did not appear').toBe(true);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // See fixtures.ts's doc comment on enrollInDemoCourse: there is currently
    // no "enroll" affordance anywhere in the UI to click through, so this
    // calls the real enroll endpoint directly (same session) instead.
    await enrollInDemoCourse(page);

    await page.goto(`/courses/e2e-demo-course/lessons/${QUIZ_DEMO_LESSON_ID}`);
    // Reaching the player at all proves the enrollment + access-control path
    // works; the seeded lesson is quiz-kind, so its player renders the
    // "start quiz" doorway rather than a video — still a real lesson.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: copy.player.quizCta })).toBeVisible();
  });

  test('an incomplete profile cannot skip past onboarding', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    // Wait for the redirect to actually land before the next HARD navigation
    // (`page.goto` below): registration's own client-side transition can
    // still be in flight, and a `goto()` fired too early aborts it.
    await expect(page).toHaveURL(/\/onboarding/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding/);
  });
});
