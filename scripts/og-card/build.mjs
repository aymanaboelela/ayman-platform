/**
 * Builds `apps/web/public/og.jpg` — the 1200×630 card WhatsApp, Messenger and
 * Facebook show when someone shares a link to the site.
 *
 *   node scripts/og-card/build.mjs
 *
 * ## Why a screenshot and not `next/og`
 *
 * `ImageResponse` renders through satori, which is not a browser: it supports
 * a subset of CSS and does its own text shaping. This card is Arabic, and
 * Arabic is the case where "its own text shaping" stops being a detail —
 * `conic-gradient`, `background-clip: text` and `filter` are all load-bearing
 * here too, and none of them are satori features. Chromium already shapes this
 * text correctly every day; the card is authored as the HTML it is and
 * photographed.
 *
 * The trade is that the output is a committed binary rather than a route. That
 * is the right trade for an asset that changes once a year and is fetched by
 * crawlers rather than by readers — and `card.html` beside this file is the
 * source, so the binary is reproducible instead of mysterious.
 *
 * ## The fonts are copied, not linked
 *
 * `card.html` loads its fonts over the same local server as everything else.
 * A `file://` page cannot, because fonts are subject to CORS and a file URL is
 * an opaque origin — the page renders in a fallback face, which for Arabic is
 * not a subtle difference. Hence the two-line static server below.
 */
import { createServer } from 'node:http';
import { mkdtemp, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/*
 * Chromium comes from `@playwright/test`, resolved from `apps/web` rather than
 * imported by bare specifier.
 *
 * Two things force this. ESM resolves bare names against the IMPORTING file's
 * directory, and this file lives in `scripts/` — no `package.json`, and no
 * `node_modules` above it holding playwright, because pnpm installs into the
 * workspace that declares it. And the declared package is `@playwright/test`,
 * not `playwright`: pnpm's strict layout means the bare `playwright` package
 * is present in the store but NOT reachable from `apps/web`, so asking for it
 * by that name fails even from the right directory.
 *
 * `require`, not `await import`: the package is CommonJS, and the ESM interop
 * wrapper puts its exports behind `.default` inconsistently enough that
 * `chromium` came back undefined.
 */
const { chromium } = createRequire(join(REPO, 'apps/web/package.json'))(
  '@playwright/test',
);
const OUT = join(REPO, 'apps/web/public/og.jpg');
const PORT = 4599;

// `apps/web`, not the root: pnpm keeps dependencies with the workspace that
// declares them, and only the web app depends on the font.
const FONT_DIR = join(
  REPO,
  'apps/web/node_modules/@fontsource/ibm-plex-sans-arabic/files',
);

/** Served filename → where it really lives. */
const ASSETS = {
  'index.html': join(HERE, 'card.html'),
  'ayman.jpg': join(REPO, 'apps/web/public/team/ayman.jpg'),
  'ar-400.woff2': join(FONT_DIR, 'ibm-plex-sans-arabic-arabic-400-normal.woff2'),
  'ar-600.woff2': join(FONT_DIR, 'ibm-plex-sans-arabic-arabic-600-normal.woff2'),
  'ar-700.woff2': join(FONT_DIR, 'ibm-plex-sans-arabic-arabic-700-normal.woff2'),
  'la-500.woff2': join(FONT_DIR, 'ibm-plex-sans-arabic-latin-500-normal.woff2'),
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
};

const staged = await mkdtemp(join(tmpdir(), 'og-card-'));
try {
  for (const [served, source] of Object.entries(ASSETS)) {
    await copyFile(source, join(staged, served));
  }

  const server = createServer(async (request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (!Object.hasOwn(ASSETS, name)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(name)] });
    response.end(await readFile(join(staged, name)));
  });
  await new Promise((ready) => server.listen(PORT, ready));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      // 1× on purpose. 1200×630 is the size every scraper asks for, and a 2×
      // file is a slower fetch for a preview nobody zooms into.
      deviceScaleFactor: 1,
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
    // `networkidle` can fire while the faces are still rasterising, and a shot
    // taken then ships fallback glyphs — which is exactly the failure this
    // whole local-server dance exists to avoid.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    // Quality 92: the card is mostly smooth dark gradient, which is where JPEG
    // bands first. Measured at 92 there is none, and the file is ~99 KB against
    // 543 KB for the same frame as a PNG.
    await page.screenshot({ path: OUT, type: 'jpeg', quality: 92 });
  } finally {
    await browser.close();
    await new Promise((closed) => server.close(closed));
  }

  console.log(`wrote ${OUT}`);
} finally {
  await rm(staged, { recursive: true, force: true });
}
