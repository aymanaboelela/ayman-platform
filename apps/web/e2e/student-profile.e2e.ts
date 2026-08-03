import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  QUIZ_DEMO_LESSON_ID,
  enrollInDemoCourse,
  registerAndOnboard,
  uniqueStudent,
} from './fixtures';

/**
 * The profile: identity, photo upload, totals, devices, and the activity
 * timeline that `lesson_view_sessions` exists to feed.
 */

/**
 * A real 8×8 PNG, built in the browser rather than read from disk — this suite
 * ships no binary fixtures, and the upload pipeline re-encodes whatever it is
 * given, so the only thing that matters is that the bytes are a genuine image
 * sharp can decode.
 */
/**
 * Waits for `<AvatarForm>` to be HYDRATED before touching its file input.
 *
 * The input is in the SSR'd HTML long before the client component driving it
 * is interactive, and `setInputFiles` on a not-yet-hydrated input fires a
 * `change` event with no React handler attached — the upload silently never
 * starts. It passes when the machine is fast and fails inside a longer suite,
 * which is the definition of a flake.
 *
 * Checking React's own props bag is implementation-coupled and deliberately
 * so: it is the only DETERMINISTIC signal that this specific input now has a
 * change handler. `fixtures.ts` uses the identical technique on the onboarding
 * form and documents why the alternatives (a fixed sleep, a retry loop) are
 * all "probably long enough".
 */
async function waitForAvatarFormReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('input[type="file"]');
      if (!el) return false;
      const key = Object.keys(el).find((name) => name.startsWith('__reactProps$'));
      return Boolean(key && (el as unknown as Record<string, { onChange?: unknown }>)[key]?.onChange);
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function pickAvatar(page: Page): Promise<void> {
  await waitForAvatarFormReady(page);

  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c98a2b';
    context.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    return Array.from(bytes);
  });

  await page.setInputFiles('input[type="file"]', {
    name: 'me.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png),
  });
}

test.describe('student profile', () => {
  test('shows who the student is, with a designed empty timeline', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/profile');

    await expect(page.getByRole('heading', { level: 1, name: copy.profile.title })).toBeVisible();
    // The phone came from onboarding, so it proves the identity block is
    // reading the real profile row rather than the session alone.
    await expect(page.getByText(student.phone).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText(copy.profile.activityEmpty).filter({ visible: true })).toHaveCount(1);
  });

  /**
   * The timeline is asserted through a QUIZ submission, not through watched
   * sittings.
   *
   * The seeded demo lesson is a quiz lesson, and `HeartbeatService.record`
   * rejects heartbeats against anything that is not a video — so there is no
   * video in the e2e seed to accumulate a sitting against, and a test that
   * posted heartbeats here would assert a 400. Seeding a video lesson would
   * mean either a real video id or a fixture the player cannot actually play.
   *
   * Sessionisation itself is covered where it can be exercised honestly: 20
   * integration tests in `heartbeat.service.spec.ts` (gap boundaries, the
   * server-granted delta, rollback) and 8 in `activity.service.spec.ts`
   * (merging, ordering, cursor paging). What this test adds — and what only a
   * browser can answer — is that a real action by a real signed-in student
   * appears on the rendered timeline.
   */
  test('shows a real action on the timeline after the student does it', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);
    await page.getByRole('button', { name: copy.quiz.start }).click();

    const chips = page.locator('[data-answered]');
    await expect(chips).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expect(chips.nth(i)).toHaveAttribute('aria-current', 'step');
      await page.getByRole('radio').filter({ visible: true }).first().check();
      await expect(chips.nth(i)).toHaveAttribute('data-answered', 'true');
      const next = page.getByRole('button', { name: copy.quiz.next }).filter({ visible: true });
      if (await next.isVisible().catch(() => false)) await next.click();
    }
    await page.getByRole('button', { name: copy.quiz.submit }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: copy.quiz.submitConfirmAction }).click();
    await page.waitForURL('**/review');

    await page.goto('/profile');

    // The empty state is gone and the quiz entry is on the list.
    await expect(page.getByText(copy.profile.activityEmpty)).toHaveCount(0);
    await expect(
      page.getByText(copy.profile.activityQuiz.split('{score}')[0]!.trim()).first(),
    ).toBeVisible();
  });

  test('uploads a photo and shows it in the shell’s account menu', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);

    await page.goto('/profile');
    // An email/password account has no photo, so the avatar starts as initials
    // — there is no <img> to find until the upload lands.
    await expect(page.getByRole('button', { name: copy.profile.photoChange })).toBeVisible();

    await pickAvatar(page);

    // The success toast is the upload's own confirmation.
    await expect(page.getByText(copy.profile.photoDone)).toBeVisible({ timeout: 20_000 });

    // And it survives a full reload, which is what proves it was persisted to
    // `User.image` rather than only shown from the local object URL.
    await page.reload();
    await expect(page.locator('main img').first()).toBeVisible();
  });

  test('rejects a file that is not an image, in Arabic', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await page.goto('/profile');
    await waitForAvatarFormReady(page);

    await page.setInputFiles('input[type="file"]', {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not an image'),
    });

    await expect(page.getByText(copy.profile.photoWrongType)).toBeVisible();
  });

  test('has no serious or critical axe violations', async ({ page }, testInfo) => {
    const student = uniqueStudent();
    await registerAndOnboard(page, student);
    await enrollInDemoCourse(page);

    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: copy.profile.title })).toBeVisible();
    // Wait for the streamed regions to settle, so the audit covers the real
    // page rather than its skeletons. By ROLE, not by text: `getByText`
    // matches ancestors that merely contain the string, so the <section>
    // wrapping this heading counts as a second match.
    await expect(
      page.getByRole('heading', { level: 2, name: copy.profile.earnedTitle }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    await testInfo.attach('axe-profile.json', {
      body: JSON.stringify(blocking, null, 2),
      contentType: 'application/json',
    });

    expect(
      blocking,
      `axe found ${blocking.length} blocking violation(s) on /profile: ${blocking
        .map((violation) => violation.id)
        .join(', ')}`,
    ).toEqual([]);
  });
});
