import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import {
  OFFICIAL_PROFILES,
  OFFICIAL_WHATSAPP_E164,
} from '@ayman/contracts/site-profiles';

const c = copy.linkhub;

/**
 * `/links` — the URL that goes in a YouTube, Instagram, TikTok and Facebook
 * bio.
 *
 * The assertions here are weighted toward one failure the others cannot catch:
 * a row that renders but points at the wrong place. Every other page in this
 * product is reached by someone who is already on it; this one is reached by
 * someone checking whether these accounts are really his, and a link to a
 * platform's own homepage — the bug `site-profiles.ts` was written to end —
 * would look completely normal in a screenshot.
 *
 * Both viewports come free: `playwright.config.ts` runs every file under a
 * `desktop` and a `mobile` project.
 */
test.describe('links page', () => {
  test('is public — no session, no redirect', async ({ page }) => {
    const response = await page.goto('/links');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/links$/);
  });

  test('leads with the name, and titles itself as the link hub', async ({ page }) => {
    await page.goto('/links');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(c.title);
    // The TITLE is «كل اللينكات», not the name — `/about` owns the name query.
    await expect(page).toHaveTitle(new RegExp(c.pageTitle));
  });

  test('every social row points at the real account, never a platform homepage', async ({
    page,
  }) => {
    await page.goto('/links');

    for (const [label, href] of [
      [copy.landing.footerYoutube, OFFICIAL_PROFILES.youtube],
      [copy.landing.footerInstagram, OFFICIAL_PROFILES.instagram],
      [copy.landing.footerTiktok, OFFICIAL_PROFILES.tiktok],
      [copy.landing.footerFacebook, OFFICIAL_PROFILES.facebook],
    ] as const) {
      const row = page.getByRole('link', { name: new RegExp(label) });
      await expect(row).toHaveAttribute('href', href);
      // A profile URL has a path. `https://www.youtube.com/` does not, and that
      // is exactly what shipped once.
      expect(new URL(href).pathname.replace(/\/+$/, '')).not.toBe('');
    }
  });

  test('the WhatsApp chat link is wa.me with the + stripped', async ({ page }) => {
    await page.goto('/links');
    const row = page.getByRole('link', { name: new RegExp(c.whatsappTitle) });
    await expect(row).toHaveAttribute(
      'href',
      `https://wa.me/${OFFICIAL_WHATSAPP_E164.replace(/^\+/, '')}`,
    );
  });

  test('the platform is the one row styled as the call to action', async ({ page }) => {
    await page.goto('/links');
    const primary = page.locator('.linkhub__row--primary');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveAttribute('href', '/courses');
  });

  test('every off-site row opens in a new tab and says so', async ({ page }) => {
    await page.goto('/links');
    const external = page.locator('.linkhub__row[target="_blank"]');
    expect(await external.count()).toBeGreaterThan(0);
    for (const row of await external.all()) {
      // `noopener` without `noreferrer` still leaks the full URL of this page
      // to every platform in the list.
      await expect(row).toHaveAttribute('rel', /noopener/);
      await expect(row).toHaveAttribute('rel', /noreferrer/);
      await expect(row.locator('.sr-only')).toHaveText(c.opens);
    }
  });

  test('is reachable from the site, not an orphan in the sitemap', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: c.pageTitle }).first()).toBeVisible();
  });

  test('has no serious or critical axe violations', async ({ page }) => {
    await page.goto('/links');
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });

  test('renders ink in BOTH themes — this surface does not follow data-theme', async ({
    page,
  }) => {
    // The one design decision on this page that a screenshot of the default
    // theme cannot verify. `.site` follows the toggle; this does not, and a
    // future refactor that "fixes" that would produce a white page whose rows
    // are coloured for a dark background.
    for (const theme of ['light', 'dark'] as const) {
      await page.goto('/links');
      await page.evaluate((t) => {
        localStorage.setItem('theme', t);
      }, theme);
      await page.reload();
      const background = await page
        .locator('.linkhub')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      // `--ink` is oklch(0.155 …) — dark in any colour space the browser
      // reports it in. Parse the channels rather than matching a string.
      const channels = background.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      expect(channels.length, `unparsed background: ${background}`).toBeGreaterThanOrEqual(3);
      expect(Math.max(...channels), `theme=${theme} background=${background}`).toBeLessThan(80);
    }
  });
});
