import { expect, type Page } from '@playwright/test';
import { copy } from '@ayman/contracts';

/**
 * MUST match `apps/api/prisma/seed-admin.ts`'s literals of the same name —
 * that script is what actually creates this course/lesson, in a different
 * package this file cannot import (it would drag Prisma into the Playwright
 * runner). If one changes, change the other.
 */
export const QUIZ_DEMO_COURSE_ID = '01990000-0000-7000-8000-00000000c001';
export const QUIZ_DEMO_LESSON_ID = '01990000-0000-7000-8000-00000000c002';

/** Egyptian mobile numbers are 11 digits beginning 010/011/012/015. */
export function uniqueStudent() {
  const stamp = Date.now().toString().slice(-8);
  return {
    email: `student-${stamp}-${Math.random().toString(36).slice(2, 8)}@e2e.test`,
    password: 'correct-horse-battery-staple-1', // gitleaks:allow -- fixed, well-known test-only password (XKCD 936), not a secret
    name: 'طالب اختبار',
    phone: `010${stamp}`,
  };
}

export async function register(page: Page, student: ReturnType<typeof uniqueStudent>): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(copy.auth.fields.name).fill(student.name);
  await page.getByLabel(copy.auth.fields.email).fill(student.email);
  // `exact: true`: "تأكيد كلمة المرور" (confirm password) contains "كلمة
  // المرور" as a substring, so a non-exact getByLabel matches BOTH fields.
  await page.getByLabel(copy.auth.fields.password, { exact: true }).fill(student.password);
  await page.getByLabel(copy.auth.fields.confirmPassword).fill(student.password);
  await page.getByRole('button', { name: copy.auth.actions.register }).click();
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(copy.auth.fields.email).fill(email);
  await page.getByLabel(copy.auth.fields.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: copy.auth.actions.login }).click();
  // `LoginForm.onSubmit` redirects via `router.replace(destination)` -- a
  // CLIENT-SIDE transition. Every caller of `login`/`loginAsAdmin` follows it
  // with another navigation, and firing that too early can abort the
  // in-flight sign-in request. Wait here, once, rather than in every caller.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(
    page,
    process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.test',
    process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password-not-a-secret',
  );
}

/**
 * The minimum set OnboardingSchema actually requires (fullName, gender,
 * phone, governorateCode — everything else, including system/year/track, is
 * `.optional()`). Filled with the FIRST real option on every select so the
 * test has no dependency on the seeded taxonomy's exact labels or ordering.
 */
export async function completeMinimalOnboarding(
  page: Page,
  student: ReturnType<typeof uniqueStudent>,
): Promise<void> {
  // `RegisterForm.onSubmit` navigates via `router.replace('/onboarding')` --
  // a CLIENT-SIDE transition, so `page.url()` can already read "/onboarding"
  // (satisfying a caller's own `toHaveURL` check), and even a heading-visible
  // check can pass, a moment before the OLD route's tree has finished
  // unmounting. `copy.onboarding.fullName` and `copy.auth.fields.name` are
  // the IDENTICAL string ("الاسم الكامل"), so a bare `getByLabel(...).fill()`
  // can hit BOTH the new onboarding field and the still-detaching register
  // field at once -- a strict-mode violation that a plain `.fill()` does not
  // retry away. `expect(...).toHaveCount(1)` uses Playwright's own polling
  // assertion to wait out that overlap instead of guessing a fixed delay.
  //
  // A generous 30s timeout here, well above this file's other assertions:
  // in `next dev` (Turbopack), a route not yet visited this session compiles
  // ON FIRST NAVIGATION, and that compile can legitimately take several
  // seconds under load -- observed directly during this task's own
  // verification, worse the more concurrent activity is on the machine.
  // `next build`/`next start` (and CI) precompile every route, so this
  // latency does not exist there; it is dev-only friction, not a product bug.
  const fullNameField = page.getByLabel(copy.onboarding.fullName);
  await expect(fullNameField).toHaveCount(1, { timeout: 30_000 });
  await fullNameField.fill(student.name);
  await page.getByLabel(copy.onboarding.gender).selectOption({ index: 1 });
  await page.getByLabel(copy.onboarding.phone).fill(student.phone);
  await page.getByLabel(copy.onboarding.governorate).selectOption({ index: 1 });
  await page.getByRole('button', { name: copy.onboarding.submit }).click();
}

/**
 * Registers a brand-new student and drives them all the way to a completed,
 * minimal profile — the shared setup every flow below needs, since
 * `/quizzes/*` (and every other product route) is gated on
 * `onboardingCompleted` by `apps/web/proxy.ts`'s redirect matrix.
 */
export async function registerAndOnboard(
  page: Page,
  student: ReturnType<typeof uniqueStudent>,
): Promise<void> {
  await register(page, student);
  await completeMinimalOnboarding(page, student);
}

/**
 * Enrolls the CURRENT session in the seeded demo course via the real API,
 * in the same browser context (so real session cookies apply) rather than
 * inserting a database row directly.
 *
 * This stands in for a UI affordance that does not exist yet: as of this
 * writing, nothing in `apps/web` renders an "enroll" control anywhere —
 * `(site)/courses/[slug]/page.tsx` lists lesson titles as plain, non-linked
 * text, `copy.course.start` and the entire `copy.enrollment.*` namespace are
 * defined but never read by any component (`git grep` confirms zero
 * references outside the copy table itself), and the dashboard's
 * `EnrolledCourseCard` only renders for courses the student is ALREADY
 * enrolled in. A brand-new student who finishes onboarding today has no
 * discoverable path from the public catalog into a lesson through the UI
 * alone. Filed as a product gap in the Task 9-15 report — fixing it means
 * building UI inside `apps/web/app/(site)/**`, which is the other agent's
 * file scope on this branch, not this task's.
 */
export async function enrollInDemoCourse(page: Page): Promise<void> {
  // Run INSIDE the page, not via `page.request`: every state-changing route
  // is behind `CsrfGuard` (Task 8), which requires the `x-csrf-token` header
  // echoing the `__Host-csrf` cookie `proxy.ts` mints on every response —
  // exactly what `lib/csrf.ts`'s `readCsrfToken()` does for the app's own
  // client code. A request built via Playwright's own `page.request` shares
  // cookies but is not a page-initiated fetch, so it never carries that
  // header (or the Origin/Sec-Fetch-Site pair the real browser adds
  // automatically) unless this reproduces both explicitly, in-page.
  const result = await page.evaluate(async (courseId) => {
    const CSRF_COOKIE = '__Host-csrf';
    const token = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${CSRF_COOKIE}=`))
      ?.slice(CSRF_COOKIE.length + 1);
    const response = await fetch(`/api/courses/${courseId}/enroll`, {
      method: 'POST',
      headers: { 'x-csrf-token': decodeURIComponent(token ?? '') },
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  }, QUIZ_DEMO_COURSE_ID);

  if (!result.ok) {
    throw new Error(`enroll failed: ${result.status} ${result.body}`);
  }
}

/**
 * A CSRF-carrying, in-page `fetch` for any state-changing admin call this
 * file's tests need to make outside a form submit — same mechanism as
 * `enrollInDemoCourse` above, generalised. Used for END-OF-TEST cleanup: a
 * course this suite creates and publishes is real, published data, and the
 * production incident this task's own verification found (`next build`
 * failing under `next-build`-scale catalog traffic) is exactly what
 * accumulating undeleted published test courses in a shared database leads
 * to. Every flow that creates one must delete it again.
 */
async function authedFetch(
  page: Page,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; body: string }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const CSRF_COOKIE = '__Host-csrf';
      const token = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${CSRF_COOKIE}=`))
        ?.slice(CSRF_COOKIE.length + 1);
      const response = await fetch(path, {
        method,
        headers: {
          'x-csrf-token': decodeURIComponent(token ?? ''),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { method, path, body },
  );
}

/**
 * Deletes a course this suite created, unpublishing it first: `CourseService
 * .remove` refuses to delete a published course (`unpublish before
 * deleting`), and the admin-publish flow's whole point is leaving the
 * course published when its assertions finish.
 */
export async function deleteTestCourse(page: Page, courseId: string): Promise<void> {
  const unpublish = await authedFetch(page, 'PATCH', `/api/admin/courses/${courseId}/status`, {
    status: 'draft',
  });
  if (!unpublish.ok) {
    throw new Error(`could not unpublish test course ${courseId} before delete: ${unpublish.status} ${unpublish.body}`);
  }
  const removed = await authedFetch(page, 'DELETE', `/api/admin/courses/${courseId}`);
  if (!removed.ok) {
    throw new Error(`could not delete test course ${courseId}: ${removed.status} ${removed.body}`);
  }
}
