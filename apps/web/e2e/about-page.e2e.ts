import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';

const c = copy.landing;

/**
 * `/about` — the page a search for «أيمن أبو العلا» should land on.
 *
 * Ranking cannot be tested, but everything that FEEDS it can: the page is
 * public, its `<h1>` and `<title>` lead with the bare name, its structured
 * data says the page is about the existing Person entity rather than defining
 * a second one, and something on the site actually links to it.
 */
test.describe('about page', () => {
  test('is public — no session, no redirect', async ({ page }) => {
    const response = await page.goto('/about');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/about$/);
  });

  test('leads with the bare name in the h1 and the title', async ({ page }) => {
    await page.goto('/about');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(c.aboutPageTitle);
    await expect(page).toHaveTitle(new RegExp(c.aboutPageTitle));
  });

  test('declares the page is ABOUT the site-wide Person, not a second one', async ({ page }) => {
    await page.goto('/about');

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed = blocks.flatMap((raw) => {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value : [value];
    });

    const profile = parsed.find((entry) => entry['@type'] === 'ProfilePage');
    expect(profile).toBeTruthy();
    expect(profile.mainEntity['@id']).toMatch(/#person$/);

    // Exactly one Person in the document — the layout's. A page-level copy
    // would put the same @id in twice.
    expect(parsed.filter((entry) => entry['@type'] === 'Person')).toHaveLength(1);
  });

  test('ties the person to his own profiles, with no share parameters', async ({ page }) => {
    await page.goto('/about');

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const person = blocks
      .flatMap((raw) => {
        const value = JSON.parse(raw);
        return Array.isArray(value) ? value : [value];
      })
      .find((entry) => entry['@type'] === 'Person');

    expect(person.sameAs).toBeTruthy();
    expect(person.sameAs.length).toBeGreaterThan(0);

    for (const url of person.sameAs as string[]) {
      // Never a platform homepage — asserting sameAs against `youtube.com/`
      // claims this site IS YouTube, which is worse than saying nothing.
      expect(url).not.toMatch(/^https:\/\/(www\.)?(youtube|facebook|instagram|tiktok)\.com\/?$/);
      // Never a share/referral parameter: the same profile under two query
      // strings is two entities to a crawler.
      expect(url).not.toMatch(/[?&](si|igsh|utm_source|_t|_r|mibextid)=/);
    }
  });

  test('is reachable from the site, not an orphan in the sitemap', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: c.aboutPageTitle }).first()).toBeVisible();
  });

  test('has no serious or critical axe violations', async ({ page }) => {
    await page.goto('/about');
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
