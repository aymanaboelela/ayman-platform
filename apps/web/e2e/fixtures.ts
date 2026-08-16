import { expect, type Locator, type Page } from '@playwright/test';
import { copy } from '@ayman/contracts';

/**
 * MUST match `apps/api/prisma/seed-admin.ts`'s literals of the same name —
 * that script is what actually creates this course/lesson, in a different
 * package this file cannot import (it would drag Prisma into the Playwright
 * runner). If one changes, change the other.
 */
export const QUIZ_DEMO_COURSE_ID = '01990000-0000-7000-8000-00000000c001';
export const QUIZ_DEMO_LESSON_ID = '01990000-0000-7000-8000-00000000c002';
/** The seeded course EXAM — improvement on, both papers built. Mirrors
 *  `EXAM_DEMO_LESSON_ID` in `apps/api/prisma/seed-admin.ts`. */
export const EXAM_DEMO_LESSON_ID = '01990000-0000-7000-8000-00000000c003';
/** Its own course, and the exam is its ONLY lesson — see `seedDemoExam` for
 *  why it is not `e2e-demo-course`. */
export const EXAM_DEMO_COURSE_ID = '01990000-0000-7000-8000-00000000c005';

/** Egyptian mobile numbers are 11 digits beginning 010/011/012/015. */
export function uniqueStudent() {
  const stamp = Date.now().toString().slice(-8);
  return {
    email: `student-${stamp}-${Math.random().toString(36).slice(2, 8)}@e2e.test`,
    password: 'correct-horse-battery-staple-1', // gitleaks:allow -- fixed, well-known test-only password (XKCD 936), not a secret
    name: 'طالب اختبار',
    phone: `010${stamp}`,
    // A DIFFERENT operator prefix from `phone`, so a fixture that fills the
    // father's number into the student's field (or the reverse) fails visibly
    // instead of passing on two identical strings.
    fatherPhone: `011${stamp}`,
  };
}

export async function register(page: Page, student: ReturnType<typeof uniqueStudent>): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(copy.auth.fields.name).fill(student.name);
  // The phone is the account's identity now, and the only required identifier
  // on this form. `getByLabel` is non-exact by default and «رقم الموبايل» is
  // not a substring of any other label here.
  await page.getByLabel(copy.auth.fields.phone).fill(student.phone);
  // Still filled, though the field is optional — the fixture wants an account
  // reachable BOTH ways so `login()` below can exercise either branch of
  // `resolveLoginIdentifier`.
  await page.getByLabel(copy.auth.fields.emailOptional).fill(student.email);
  // `exact: true`: "تأكيد كلمة المرور" (confirm password) contains "كلمة
  // المرور" as a substring, so a non-exact getByLabel matches BOTH fields.
  await page.getByLabel(copy.auth.fields.password, { exact: true }).fill(student.password);
  await page.getByLabel(copy.auth.fields.confirmPassword).fill(student.password);
  await page.getByRole('button', { name: copy.auth.actions.register }).click();
}

/**
 * `identifier` is a phone OR an email — the sign-in form has one field and
 * works out which, so both are valid here and both are worth passing from
 * different specs.
 */
export async function login(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(copy.auth.fields.identifier).fill(identifier);
  await page.getByLabel(copy.auth.fields.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: copy.auth.actions.login }).click();
  // `LoginForm.onSubmit` redirects via `router.replace(destination)` -- a
  // CLIENT-SIDE transition. Every caller of `login`/`loginAsAdmin` follows it
  // with another navigation, and firing that too early can abort the
  // in-flight sign-in request. Wait here, once, rather than in every caller.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * Waits until a control is not merely PRESENT but actually wired up.
 *
 * A Client Component's markup is in the SSR'd HTML long before React has
 * attached its handlers. Playwright's actionability checks cannot see that gap:
 * the element is visible, enabled and stable, so `.click()` fires happily into
 * dead HTML and nothing happens — no request, no error, no navigation. The test
 * then fails on whatever it asserted next, pointing at the assertion rather
 * than at the click.
 *
 * That is what was happening to `login-gated-content.e2e.ts`'s «one click opens
 * the lesson»: after signing in, `router.replace` lands back on the course page
 * and `toHaveURL` goes green immediately — a URL match says nothing about
 * hydration. Probed directly, the button had no `__reactProps$` key at all at
 * the moment of the click, and the enroll request was never issued. It passed
 * when run alone and failed after `learning-path.e2e.ts`, because in `next dev`
 * a busier server hydrates later. Pre-existing; it just needed someone to look
 * at what the click actually did rather than at what came after it.
 *
 * Checking React's own props bag is implementation-coupled on purpose, and for
 * the same reason `completeMinimalOnboarding` below does it: it is the only
 * DETERMINISTIC signal that this specific element now has a handler. A fixed
 * sleep is "probably long enough", which is the flake this replaces.
 */
export async function waitForHydration(locator: Locator, handler = 'onClick'): Promise<void> {
  await expect(locator).toBeVisible();
  await locator.evaluate(
    (el, name) =>
      new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 30_000;
        const poll = () => {
          const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
          const props = key
            ? (el as unknown as Record<string, Record<string, unknown>>)[key]
            : undefined;
          if (props && typeof props[name] === 'function') return resolve();
          if (Date.now() > deadline) {
            return reject(new Error(`${el.tagName} never received a React ${name} handler`));
          }
          requestAnimationFrame(poll);
        };
        poll();
      }),
    handler,
  );
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

  // The form is a four-step wizard, so this walks it rather than filling one
  // long page. "Minimal" now means every REQUIRED field and nothing else —
  // the school stream and the father's phone are required, so a fixture that
  // stepped past them (as this one used to) would leave every caller stuck on
  // an onboarding form that refuses to submit. The year on step 3 is the one
  // thing still genuinely optional here; `onboardWithYear` in
  // `student-library.e2e.ts` is the fixture that answers it.
  //
  // Scoped to `main` and to visible elements throughout, for the reason the
  // comment above gives: the register route stays mounted in a `display: none`
  // container, and its `name` input carries the identical label.
  const main = page.getByRole('main');
  const next = main.getByRole('button', { name: copy.onboarding.next });

  await fullNameField.fill(student.name);
  await main.getByLabel(copy.onboarding.gender).selectOption({ index: 1 });
  await main.getByLabel(copy.onboarding.phone).fill(student.phone);
  await next.click();

  const governorate = main.getByLabel(copy.onboarding.governorate);
  await expect(governorate).toBeVisible();
  await governorate.selectOption({ index: 1 });
  await main.getByLabel(copy.onboarding.schoolStream).selectOption('general');
  await next.click();

  // Step 3 is the year — the only academic question left, and the only
  // optional one, so it is stepped past without input. `toBeVisible` on its
  // select first: clicking `next` twice in a row would otherwise race the
  // re-render and land both clicks on the same step.
  await expect(main.getByLabel(copy.onboarding.year)).toBeVisible();
  await next.click();

  const fatherPhone = main.getByLabel(copy.onboarding.fatherPhone);
  await expect(fatherPhone).toBeVisible();
  await fatherPhone.fill(student.fatherPhone);

  const submit = main.getByRole('button', { name: copy.onboarding.submit });
  await expect(submit).toBeVisible();
  await submit.click();

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

  /*
   * Onboarding no longer ends at the dashboard. `OnboardingForm` now sends a
   * new student to `/welcome`, the one screen that offers the WhatsApp channel
   * while their hands are still empty — see that page for why the ask lives
   * there and why it can be walked past.
   *
   * So the fixture walks past it, exactly as a student does. It is CONDITIONAL
   * because the screen is: `/welcome` redirects straight through when
   * `contact.whatsappChannel` is unset, which is the shipped default and was
   * the state every one of these specs was written against. A seed that
   * configures a channel — which CI now has — is what made three unrelated
   * suites fail on a URL assertion, all of them stranded on a greeting.
   *
   * Not `page.goto('/dashboard')`: pressing the real control is what keeps this
   * fixture honest about the journey, and a hard navigation here would hide a
   * broken «ادخل على المنصة» link from every test that depends on it.
   */
  if (new URL(page.url()).pathname.startsWith('/welcome')) {
    await page.getByRole('link', { name: copy.welcome.continue }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/welcome'), { timeout: 30_000 });
  }
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
 * ⚠️ This used to stand in for a UI affordance that did not exist: nothing in
 * `apps/web` rendered an enroll control anywhere, so a student who finished
 * onboarding had no path from the public catalog into a lesson at all. That gap
 * is closed — `(site)/courses/[slug]` now carries `<CourseStartButton>`, and
 * `login-gated-content.e2e.ts` drives that real button rather than this helper.
 *
 * It is kept for the flows that are not ABOUT enrollment (the quiz suites,
 * `signup-onboarding-lesson`): they need a student inside a course as a
 * precondition, and getting there through the UI would make every one of them
 * fail whenever the course page's layout changed. Setup goes through the API;
 * only the test that owns the behaviour clicks the button.
 */
/**
 * Presses «ابدأ الامتحان» and walks through the gate that now stands between
 * it and a created attempt.
 *
 * Shared rather than repeated, because the gate is on the path of EVERY test
 * that sits a quiz — profile, results, notifications, review — and five copies
 * of "click, confirm" is five places to forget when the wording moves.
 *
 * Returns once the runner has been reached, so callers read exactly as they
 * did when start was a single click.
 */
export async function startAttempt(page: Page): Promise<void> {
  await page.getByRole('button', { name: copy.quiz.start }).click();
  await page.getByRole('button', { name: copy.examGate.agree }).click();
  await page.waitForURL(/\/quizzes\/.+\/attempt\/.+/);
}

export async function enrollInDemoCourse(page: Page): Promise<void> {
  return enrollInCourse(page, QUIZ_DEMO_COURSE_ID);
}

/** The exam course. Its only lesson is the final exam, so nothing gates it. */
export async function enrollInExamCourse(page: Page): Promise<void> {
  return enrollInCourse(page, EXAM_DEMO_COURSE_ID);
}

async function enrollInCourse(page: Page, courseId: string): Promise<void> {
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
  }, courseId);

  if (!result.ok) {
    throw new Error(`enroll into ${courseId} failed: ${result.status} ${result.body}`);
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
