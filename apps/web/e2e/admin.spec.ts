import { expect, test } from '@playwright/test';

/**
 * Plan 6's admin dashboard, end to end.
 *
 * ⚠️ SKIPPED — and deliberately visible rather than silently broken.
 *
 * This file was written speculatively, before Playwright was installed, "to
 * run the moment Plan 7 adds the config". That moment arrived and nobody
 * re-ran it: its selectors, its sign-in helper and its fixture accounts were
 * never validated against the real app. It also guessed credentials
 * (`admin@example.test` / `Passw0rd!123`) that match neither `e2e/fixtures.ts`
 * nor `prisma/seed-admin.ts`, and it assumes a seeded STUDENT account that no
 * seed script creates.
 *
 * It was worse than dead, though. The glob in this comment used to be spelled
 * with its leading double-star, which contains the two characters that CLOSE a
 * block comment — so the comment ended early, the rest of the file became
 * stray tokens, and Playwright threw a SyntaxError while COLLECTING. That
 * aborted the entire e2e suite, not just this file. `apps/web/tsconfig.json`
 * excludes `e2e/`, so `tsc --noEmit` never parsed it and never said a word.
 *
 * The parse error is fixed, so the rest of the suite runs. Un-skipping this
 * file needs three things, none of them in scope for the learning-path work
 * that uncovered it:
 *   1. a seeded student account (or switch these to `register()` from
 *      `fixtures.ts`, as every other spec does);
 *   2. `signIn` replaced by `fixtures.ts`'s `login`, which waits out the
 *      client-side redirect this local copy does not;
 *   3. its selectors re-checked against the shipped admin UI.
 */
// ⚠️ These defaults MUST match `e2e/fixtures.ts`'s — that file is what the rest
// of the suite signs in with, and `prisma/seed-admin.ts` is what actually
// creates the account. This file was written before any of that existed and
// guessed `admin@example.test` / `Passw0rd!123`, which matches nothing; every
// test below failed on sign-in the moment the suite could parse it again.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password-not-a-secret';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'student@example.test';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Passw0rd!123';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
}

test.describe.skip('admin dashboard — access control', () => {
  test('a signed-out visitor is redirected away from /admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test('a student gets a 404, not a 403, on every admin route (README\'s "404 not 403" pattern)', async ({
    page,
  }) => {
    await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);
    await page.waitForURL('**/dashboard');

    for (const path of [
      '/admin',
      '/admin/students',
      '/admin/attempts',
      '/admin/taxonomy',
      '/admin/media',
      '/admin/flags',
      '/admin/navigation',
      '/admin/home',
      '/admin/audit',
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });
});

test.describe.skip('admin dashboard — shell', () => {
  test('an admin signs in, lands on the overview, and the sidebar lists every section', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL('**/admin');

    await expect(page.getByRole('heading', { name: 'لوحة التحكم' })).toBeVisible();
    await expect(page.getByText('كل حاجة في الموقع بتتظبط من هنا.')).toBeVisible();

    // Scoped to the sidebar's own `<nav aria-label="لوحة التحكم">` — the
    // overview page (`admin/page.tsx`) renders the SAME labels a second time
    // as link cards in its body, so an unscoped `getByRole('link', {name})`
    // would match twice and fail Playwright's strict mode.
    const sidebar = page.getByRole('navigation', { name: 'لوحة التحكم' });
    for (const label of [
      'الطلبة',
      'المحاولات',
      'التظلمات',
      'الهيكل الدراسي',
      'مكتبة الوسائط',
      'خصائص التشغيل',
      'القوائم',
      'الصفحة الرئيسية',
      'الهوية البصرية',
      'سجل النشاط',
    ]) {
      await expect(sidebar.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('⌘K (or Ctrl+K) opens the command palette', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL('**/admin');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByPlaceholder('دور على أمر أو صفحة...')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('دور على أمر أو صفحة...')).not.toBeVisible();
  });
});

test.describe.skip('admin dashboard — students list', () => {
  test('a filtered student list URL is shareable — a second tab renders the same filtered rows server-side', async ({
    page,
    context,
  }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL('**/admin');

    await page.goto('/admin/students');
    await page.getByPlaceholder('دور...').fill('a');
    await page.waitForURL(/[?&]q=a/);

    const sharedUrl = page.url();
    const second = await context.newPage();
    // View-source proves the filtered rows come from the server render, not
    // client-side re-fetch — the search box's filled value must already be
    // in the raw HTML before any client JS runs.
    const response = await second.goto(sharedUrl);
    const html = await response?.text();
    expect(html).toContain('value="a"');
    await second.close();
  });
});

test.describe.skip('admin dashboard — branding cache invalidation', () => {
  /**
   * NOTE: no task brief in this plan (Task 5, 6 or 8 — the only three that
   * touch `site_settings`) actually builds an editable form at
   * `/admin/settings/branding|seo|contact`; `branding/page.tsx` ships
   * READ-ONLY (it renders the current accent/radius, nothing else), and
   * `git grep updateTag` finds no settings save path anywhere in
   * `apps/web`. Task 6's own brief says "form lands in Task 8's shell", but
   * Task 8's brief only builds the sidebar/header/nav table — this is a real
   * gap between the plan's file-structure overview and its 17 concrete task
   * briefs, not something invented here. These tests therefore drive the
   * change through the real `PATCH /api/admin/settings/branding` endpoint
   * (Task 5, shipped) rather than through a form that does not exist, and
   * assert on the real renderer (Task 6, shipped: `app/layout.tsx`'s inline
   * `<style>` from `getBranding()`).
   */
  test('a branding change via the API is reflected on the very next request (updateTag, not revalidateTag)', async ({
    page,
    request,
  }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/');
    const before = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--a-9').trim(),
    );

    const patchResponse = await request.patch('/api/admin/settings/branding', {
      data: { accent: 'cyan' },
    });
    expect(patchResponse.ok()).toBe(true);

    // No cache-busting query param, no second visit needed: `updateTag`
    // expires AND refreshes the tag for the current request, so the very
    // next navigation already carries the new accent — the `revalidateTag`
    // mistake (Global Constraint 15) would instead require a second request
    // before the change appeared.
    await page.goto('/');
    const after = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--a-9').trim(),
    );
    expect(after).not.toBe(before);
  });

  test('the new accent is already in the raw server-rendered HTML — no flash of the old colour on reload', async ({
    request,
  }) => {
    // Server-rendered <style> must carry the CURRENT branding before any
    // client JS runs — view-source, not a post-hydration computed style, is
    // the real FOUC proof.
    const response = await request.get('/');
    const html = await response.text();
    expect(html).toMatch(/<style[^>]*>[^<]*--a-9/);
  });
});

test.describe.skip('admin dashboard — audit log', () => {
  test('an admin action writes an audit_log row visible in the viewer with a valid chain', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Do something auditable first (toggle a flag), then check the log.
    await page.goto('/admin/flags');
    await page.getByRole('switch').first().click();
    await expect(page.getByText('اتحفظت الخاصية')).toBeVisible();

    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'سجل النشاط' })).toBeVisible();
    await expect(page.getByText('سلسلة السجل سليمة')).toBeVisible();

    const firstRow = page.getByRole('row').nth(1);
    await expect(firstRow).toContainText(ADMIN_EMAIL);
  });
});

test.describe.skip('admin dashboard — media library', () => {
  test('upload gates: renamed executable is rejected, a real image is accepted and re-encoded', async ({
    page,
  }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/media');

    // A file with a `.png` extension but non-image bytes must fail the
    // magic-byte check (`file-type` on the buffer, never the extension or
    // the browser-supplied Content-Type).
    await page.setInputFiles('input[type="file"]', {
      name: 'fake.png',
      mimeType: 'image/png',
      buffer: Buffer.from('MZ\x90\x00this-is-not-really-a-png'),
    });
    await expect(page.getByText('مقدرناش نرفع الصورة')).toBeVisible();

    // A real 1x1 PNG must succeed and appear in the grid, re-encoded to
    // WebP with a UUID key (never the original filename).
    const onePxPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    await page.setInputFiles('input[type="file"]', {
      name: 'real.png',
      mimeType: 'image/png',
      buffer: onePxPng,
    });
    await expect(page.getByText('اترفعت الصورة')).toBeVisible();
    await expect(page.locator('img[src*=".webp"]').last()).toBeVisible();
  });

  test('path traversal in a media key 404s, and the media origin is isolated from the app origin', async ({
    page,
    request,
  }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // The real route is `GET /media/:prefix/:name` on the API's own origin
    // (:3300), outside the `/api` prefix (`main.ts` excludes it) — there is
    // no `/api/media/...` path. `%2f` survives Express's segment split and
    // is decoded to a literal `/` inside the `:name` param, so this is a
    // real attempt to smuggle `..` past the two-segment route shape; it is
    // caught by `STORAGE_KEY_PATTERN` + the root-containment check in
    // `local-disk.storage.ts`'s `resolveKey()` (comment A11: "either alone
    // has been bypassed before"), which makes `stat()` return null and the
    // controller throw `NotFoundException`.
    const traversal = await request.get(
      `${process.env.E2E_MEDIA_ORIGIN ?? 'http://localhost:3300'}/media/ab/..%2f..%2f..%2fetc%2fpasswd`,
    );
    expect(traversal.status()).toBe(404);

    // Media is served from its own origin (never the app's :3200 origin) —
    // fetching a media URL through the app's own port must 404, and the
    // real media origin must serve it with a safe, cacheable header set.
    const appOriginAttempt = await request.get('http://localhost:3200/media/nonexistent-key.webp');
    expect(appOriginAttempt.status()).toBe(404);
  });
});
