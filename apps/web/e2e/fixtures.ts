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
  // (satisfying a caller's own `toHaveURL` check) while the OLD route's tree
  // is still in the document. `copy.onboarding.fullName` and
  // `copy.auth.fields.name` are the IDENTICAL string ("الاسم الكامل"), so a
  // bare `getByLabel(...)` matches the new onboarding field AND the register
  // field at the same time.
  //
  // The previous version waited that overlap out with `toHaveCount(1)`, on the
  // assumption that the register tree finishes detaching. It does not. Next's
  // App Router keeps the outgoing segment in the DOM inside a `display: none`
  // container, and it stays there: measured 2.7s after the transition, both
  // `#name` (0x0, the register leftover) and `#fullName` (582x40, the real
  // onboarding field) are still present, and they still are on the last poll.
  // So `toHaveCount(1)` never became true, and when the locator happened to
  // resolve to the hidden one first, `.fill()` retried against an element that
  // could never become visible until the 60s timeout.
  //
  // `filter({ visible: true })` is the fix, and it is the accurate expression
  // of the intent besides: this fixture wants the field a student can actually
  // type into, not "whichever element carries that label". The count assertion
  // stays as the WAIT -- the onboarding field mounts a beat after the URL
  // changes -- with a generous timeout because in `next dev` (Turbopack) a
  // route not yet visited this session compiles ON FIRST NAVIGATION.
  // `next build`/`next start` (and CI) precompile every route, so that latency
  // is dev-only friction, not a product bug.
  const fullNameField = page.getByLabel(copy.onboarding.fullName).filter({ visible: true });
  await expect(fullNameField).toHaveCount(1, { timeout: 30_000 });

  // Then wait for the form to be HYDRATED before typing into it. The field is
  // present in the SSR'd HTML long before `OnboardingForm` (a Client Component
  // driving react-hook-form) is interactive, and React's hydration pass writes
  // the server-rendered value — empty — back over anything typed in between.
  // The symptom is a submit that comes back "الاسم الكامل مطلوب" over a field
  // the video clearly shows was filled.
  //
  // Checking React's own props bag is implementation-coupled, and deliberately
  // so: it is the only DETERMINISTIC signal that this specific input now has a
  // change handler attached. The alternatives (a fixed sleep, or filling in a
  // retry loop until the value sticks) are both "probably long enough", which
  // is exactly the class of flake this replaces.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#fullName');
      if (!el) return false;
      const key = Object.keys(el).find((name) => name.startsWith('__reactProps$'));
      return Boolean(key && (el as unknown as Record<string, { onChange?: unknown }>)[key]?.onChange);
    },
    undefined,
    { timeout: 30_000 },
  );

  await fullNameField.fill(student.name);
  await page.getByLabel(copy.onboarding.gender).selectOption({ index: 1 });
  await page.getByLabel(copy.onboarding.phone).fill(student.phone);
  await page.getByLabel(copy.onboarding.governorate).selectOption({ index: 1 });
  await page.getByRole('button', { name: copy.onboarding.submit }).click();

  // Wait for the profile write to actually land, exactly as `login()` above
  // waits for its own redirect. This used to return the instant the click was
  // dispatched, which made every caller race the `PATCH /api/profile/onboarding`
  // request: `signup-onboarding-lesson.e2e.ts` happened to be safe because its
  // next line is `toHaveURL(/\/dashboard/)`, but the quiz flows went straight
  // on to enroll and open a lesson, and `proxy.ts` bounces an
  // authenticated-but-not-onboarded session back to /onboarding on every
  // protected route -- so they landed on a blank onboarding form and timed out
  // hunting for a button that was never going to be there.
  await page.waitForURL((url) => !url.pathname.startsWith('/onboarding'), { timeout: 30_000 });
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
