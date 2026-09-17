import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

/**
 * The agent-discovery surface, end to end.
 *
 * Every document here is machine-read and nothing renders it, so a break is
 * invisible: no page 500s, no test fails, no user complains. The site simply
 * stops being discoverable by assistants and nobody finds out for a quarter.
 * That is the same argument `a11y.e2e.ts` makes about unlisted public routes,
 * and it applies harder to files a human never opens.
 *
 * These run against the real server on both projects, which is deliberate for
 * the content-negotiation cases: `Vary: Accept` is only meaningful if the
 * server actually branches on the header, and only a real request proves it.
 */

/** Path → the media type it must be served as. Wrong type = undiscoverable. */
const DISCOVERY_DOCUMENTS: [path: string, contentType: RegExp][] = [
  ['/.well-known/api-catalog', /application\/linkset\+json/],
  ['/openapi.json', /application\/vnd\.oai\.openapi\+json/],
  ['/docs/api', /text\/markdown/],
  ['/auth.md', /text\/markdown/],
  ['/llms.txt', /text\/plain/],
  ['/.well-known/agent-skills/index.json', /application\/json/],
  ['/robots.txt', /text\/plain/],
];

test.describe('agent discovery documents', () => {
  for (const [path, contentType] of DISCOVERY_DOCUMENTS) {
    test(`${path} is served with the right media type`, async ({ request }) => {
      const response = await request.get(path);

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(contentType);
      expect((await response.body()).byteLength).toBeGreaterThan(0);
    });
  }
});

/**
 * These read the DOCUMENT, not the response header, and that is the whole
 * point of the change they cover: the relations used to be a `Link` header set
 * in `proxy.ts`, and that header grew by one copy of itself on every cache
 * revalidation until it exceeded the 16KB `fetch` limit and took production
 * down. `<link>` elements are part of the cached HTML, so a re-render replaces
 * them instead of appending.
 */
test.describe('agent discovery relations in the document', () => {
  test('the homepage advertises the api-catalog relation', async ({ page }) => {
    await page.goto('/');

    // The exact finding the readiness scan reported: nothing on the homepage
    // pointed an agent at `/.well-known/api-catalog`.
    await expect(page.locator('link[rel="api-catalog"]')).toHaveAttribute(
      'href',
      '/.well-known/api-catalog',
    );
    await expect(page.locator('link[rel="service-desc"]')).toHaveAttribute(
      'href',
      '/openapi.json',
    );
    await expect(page.locator('link[rel="sitemap"]')).toHaveAttribute('href', '/sitemap.xml');
  });

  test('React hoists them into head rather than leaving them in body', async ({ page }) => {
    await page.goto('/');
    // If this ever fails the relations still exist, but a parser that only
    // reads `<head>` — which is most of them — would not see them.
    const inHead = await page.locator('head link[rel="api-catalog"]').count();
    expect(inHead, 'the discovery links belong in <head>').toBe(1);
  });

  test('every advertised target actually resolves', async ({ page, request }) => {
    await page.goto('/');
    const targets = await page
      .locator('link[rel="api-catalog"], link[rel="service-desc"], link[rel="service-doc"], link[rel="status"], link[rel="describedby"], link[rel="sitemap"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));

    expect(targets.length).toBeGreaterThan(4);

    for (const target of targets) {
      const response = await request.get(target);
      // A relation pointing at a 404 is worse than none: an agent spends the
      // round trip and concludes the capability does not exist.
      expect(response.status(), `${target} should not 404`).toBe(200);
    }
  });

  test('a signed-in surface does not advertise the catalog', async ({ page }) => {
    // `/dashboard` redirects an anonymous visitor to /login. Neither carries
    // the discovery links, because both carry `X-Robots-Tag: noindex` — asking
    // an agent not to look and then handing it a catalog is a contradiction.
    await page.goto('/dashboard');
    await expect(page.locator('link[rel="api-catalog"]')).toHaveCount(0);
  });

  test('page responses carry no discovery relations in the Link header', async ({ request }) => {
    /*
     * The regression guard. `proxy.ts` must not start setting these again: the
     * growth needs the Redis-backed shell cache, so it is invisible in
     * development and only shows up in production, hours later, as a 404.
     *
     * ⚠️ This assertion no longer runs before a merge. `67d80eb` moved the `e2e`
     * job to `schedule`/`workflow_dispatch` only, so this suite is nightly now.
     * `lib/agents/link-header-guard.test.ts` is the fast half that still runs on
     * every pull request: it cannot see bytes on the wire, so it asserts the
     * CAUSE instead — that neither `proxy.ts` nor `next.config.ts` puts a `Link`
     * on a page response, those being the only two doors onto one. Keep both.
     * This one is the only thing that can catch the header growing for a reason
     * nobody predicted.
     *
     * It asserts ABSENT RELATIONS, not an absent header. A first version of
     * this test demanded no `Link` header at all and failed in CI, correctly:
     * Next emits its own `Link` for font preloads on every page, which is
     * exactly the 873 bytes production settled at once ours was removed. That
     * one is fixed-size and Next's business. Ours is what must never return.
     */
    for (const path of ['/', '/courses', '/about']) {
      const link = (await request.get(path)).headers().link ?? '';
      expect(link, `${path} must not advertise the api catalog`).not.toContain('api-catalog');
      expect(link, `${path} must not carry discovery relations`).not.toContain('rel="describedby"');
      expect(link, `${path} must not carry discovery relations`).not.toContain('rel="service-desc"');
      // Next's own preloads are small and bounded. Anything approaching the
      // 16KB `fetch` limit means something is accumulating again.
      expect(link.length, `Link header on ${path} is ${link.length} bytes`).toBeLessThan(4096);
    }
  });
});

test.describe('markdown for agents', () => {
  test('Accept: text/markdown returns markdown, and a browser still gets HTML', async ({
    request,
  }) => {
    const markdown = await request.get('/', { headers: { Accept: 'text/markdown' } });
    expect(markdown.headers()['content-type']).toMatch(/text\/markdown/);
    expect(markdown.headers()['x-markdown-tokens']).toMatch(/^\d+$/);

    const html = await request.get('/', {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8',
      },
    });
    expect(html.headers()['content-type']).toMatch(/text\/html/);
  });

  /**
   * The load-bearing half of the caching story, and the one that is actually
   * achievable — see `applyAgentDiscoveryHeaders` in `proxy.ts` for why the
   * HTML response cannot carry `Accept` in its `Vary` (Next owns that header
   * on page responses and overwrites anything we set).
   *
   * A shared cache must never hand a student the markdown an agent asked for.
   * This is what prevents it: the markdown is stored keyed on an `Accept` a
   * browser never sends. If this assertion ever fails, that protection is gone
   * and the negotiation has to be re-thought — it is not a cosmetic header.
   */
  test('markdown responses vary on Accept so a cache cannot serve them to a browser', async ({
    request,
  }) => {
    for (const response of [
      await request.get('/', { headers: { Accept: 'text/markdown' } }),
      await request.get('/courses.md'),
    ]) {
      expect(response.headers().vary).toMatch(/\bAccept\b/i);
    }
  });

  test('the .md suffix works without any Accept negotiation', async ({ request }) => {
    for (const path of ['/index.md', '/courses.md', '/about.md', '/essentials.md', '/years/1.md']) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['content-type'], path).toMatch(/text\/markdown/);
      expect((await response.text()).trim().startsWith('#'), `${path} should start with a heading`).toBe(true);
    }
  });

  /**
   * The security case, and the reason `isMarkdownablePath` uses a negative
   * lookahead. The player is session- AND enrolment-gated; a markdown twin of
   * it would hand lesson content to anyone with curl.
   */
  test('the lesson player has no markdown twin', async ({ request }) => {
    for (const path of [
      '/dashboard.md',
      '/admin.md',
      '/courses/e2e-demo-course/lessons/anything.md',
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).not.toBe(200);
    }
  });
});

test.describe('content signals', () => {
  test('robots.txt declares the instructor’s AI preferences', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();

    expect(body).toContain('Content-Signal:');
    // Decided by the site owner: indexable, quotable, not training data.
    expect(body).toContain('ai-train=no');
    expect(body).toContain('ai-input=yes');
    expect(body).toContain('search=yes');
  });

  /**
   * robots.txt must not contradict the API catalog. Longest-match wins for
   * both Google and Bing, so the `Allow` lines have to be MORE specific than
   * `Disallow: /api/` — otherwise a well-behaved agent reads the catalog and
   * then refuses to fetch anything in it.
   */
  test('robots.txt permits the endpoints the API catalog advertises', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();

    expect(body).toContain('Disallow: /api/');
    for (const allowed of ['/api/catalog/', '/api/taxonomy', '/api/health']) {
      const allowLine = `Allow: ${allowed}`;
      expect(body).toContain(allowLine);
      expect(allowed.length).toBeGreaterThan('/api/'.length);
    }
  });
});

/**
 * What a crawler that does not execute JavaScript actually reads.
 *
 * ⚠️ These assertions are on `request.get('/')` — the raw HTML — and not on a
 * `page`, deliberately. In a browser the document is always fine: the streamed
 * content replaces the Suspense fallbacks and the DOM ends up with one `<main>`
 * in the right place. The bug this guards was visible ONLY in the bytes, and
 * most AI crawlers only ever see the bytes.
 *
 * On 2026-09-13 those bytes contained three `<main>` elements — two of them
 * loading skeletons — and the page's `<h1>` arrived after the footer, roughly
 * 31 KB in, behind an `<h2>` and three `<h3>`s. An AI-readiness scan scored the
 * site 0/20 on heading hierarchy, 0/20 on semantic elements, 0/10 on landmarks,
 * and reported that an AI visitor could not tell what the site was for.
 *
 * Three separate changes hold this up — the skeletons are no longer landmarks,
 * the landing page is `'use cache'` so its content is prerendered, and the
 * footer's headings were demoted to paragraphs — and any one of them being
 * reverted re-breaks it. Hence an assertion on the outcome rather than on any
 * of the three mechanisms.
 */
test.describe('the document a JS-less crawler reads', () => {
  test('the homepage has exactly one main landmark', async ({ request }) => {
    const html = await (await request.get('/')).text();

    expect(html.match(/<main[\s>]/g) ?? []).toHaveLength(1);
    expect(html.match(/<footer[\s>]/g) ?? []).toHaveLength(1);
  });

  test('the first heading in the homepage source is the h1', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const headings = [...html.matchAll(/<(h[1-6])[\s>]/g)].map((match) => match[1]);

    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0]).toBe('h1');
    // And only one of them — a second h1 is the other half of the same check.
    expect(headings.filter((tag) => tag === 'h1')).toHaveLength(1);
  });

  test('an article states its publication date in text, not only in an attribute', async ({
    request,
  }) => {
    /*
     * `<time dateTime="…">اتنشر</time>` satisfied every parser that reads the
     * attribute and left the rendered text with no date in it at all — which is
     * what a reader sees, and what a model summarising the page sees.
     *
     * The list page is the entry point, so this walks to the first article
     * rather than hard-coding a slug: article slugs are Arabic, editable from
     * the admin, and a test naming one breaks the day it is renamed.
     */
    const list = await (await request.get('/news')).text();
    const href = /href="(\/news\/[^"]+)"/.exec(list)?.[1];
    test.skip(!href, 'no published articles to check');

    const article = await (await request.get(href as string)).text();
    const time = /<time[^>]*>([\s\S]*?)<\/time>/.exec(article)?.[1] ?? '';
    const text = time.replace(/<[^>]+>/g, '').trim();

    // A year is the cheapest thing to assert that a bare label cannot satisfy.
    expect(text).toMatch(/\d{4}/);
  });
});

test.describe('agent skills', () => {
  test('every indexed skill resolves and matches its published digest', async ({ request }) => {
    const index = (await (await request.get('/.well-known/agent-skills/index.json')).json()) as {
      skills: { name: string; url: string; sha256: string; description: string }[];
    };

    expect(index.skills.length).toBeGreaterThan(0);

    for (const skill of index.skills) {
      const response = await request.get(new URL(skill.url).pathname);
      expect(response.status(), skill.name).toBe(200);

      // The digest is the only reason to publish one: it must describe the
      // bytes actually served, or a verifying agent rejects valid content.
      const body = await response.text();
      const digest = createHash('sha256').update(body, 'utf8').digest('hex');
      expect(digest, `${skill.name} digest`).toBe(skill.sha256);
    }
  });
});

test.describe('openapi', () => {
  test('describes only unauthenticated GET routes', async ({ request }) => {
    const document = (await (await request.get('/openapi.json')).json()) as {
      openapi: string;
      security: unknown[];
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(document.openapi).toMatch(/^3\.1/);
    // An empty top-level `security` is the explicit "no auth required".
    expect(document.security).toEqual([]);

    for (const [path, operations] of Object.entries(document.paths)) {
      expect(Object.keys(operations), `${path} should be read-only`).toEqual(['get']);
    }

    // Generated from the Zod contracts rather than hand-written — if this is
    // empty, the generation step silently produced nothing.
    expect(Object.keys(document.components.schemas).length).toBeGreaterThan(0);
  });
});

test.describe('the Link header stays a fixed size', () => {
  /**
   * The header that took the site down.
   *
   * On 2026-08-06 production served `404 page not found` — nineteen bytes of
   * Traefik's own plain text — on every page, twice, the second time within
   * hours of a redeploy that had "fixed" the first. The cause was this header:
   * measured inside the container it had reached **38,234 bytes**, the same
   * seven relations repeated over and over in one value, growing by one copy
   * at a time and never shrinking.
   *
   * The first casualty was the container's own healthcheck, which uses Node's
   * `fetch` and therefore gives up at 16KB with `UND_ERR_HEADERS_OVERFLOW` —
   * so the web container reported `unhealthy` continuously while serving fine
   * from outside, and Traefik eventually stopped routing to it.
   *
   * Nothing about that is visible in a browser, in a page test, or in a log.
   * The only thing that would have caught it is a number, so here is the
   * number. 8KB is far above what any of these responses legitimately carry
   * and far below the 16KB where things start breaking.
   *
   * ⚠️ There is no "thirty requests in a row do not grow it" test here, and
   * its absence is deliberate. One was written, and it could never have
   * worked: the growth is NOT per request. Measured against production it was
   * +2595 bytes every five minutes — 519 a minute, one copy of the value per
   * CACHE REVALIDATION — and it held that rate whether the site was being
   * hammered or idle. Thirty requests inside a second add nothing at all, so
   * such a test passes on a build that is actively taking the site down. A
   * test that cannot fail is worse than no test: it reads as coverage.
   *
   * What replaces it is exact rather than statistical — `page responses carry
   * no Link header at all any more`, above. The relations live in the document
   * now; if anything ever sets this header on a page again, that test fails
   * immediately and on every run.
   */
  const CEILING = 8 * 1024;

  const linkBytes = (response: { headersArray: () => { name: string; value: string }[] }) =>
    response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'link')
      // `headersArray`, not `headers()`: Next emits its own `Link` for font
      // preloads, and the flattened accessor hides that there is more than
      // one. What matters is the total on the wire.
      .reduce((sum, header) => sum + header.value.length, 0);

  for (const path of ['/', '/courses', '/about']) {
    test(`${path} — Link is well under the limit clients impose`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(linkBytes(response), `Link header on ${path}`).toBeLessThan(CEILING);
    });
  }

  test('the markdown twin still carries its relations, and they stay small', async ({
    request,
  }) => {
    /*
     * The one place `proxy.ts` still sets `Link`. It is a rewrite to a route
     * handler rather than a cached page shell, so the folding that broke the
     * page responses does not apply — but "does not apply" is a claim, and
     * this is the number that checks it.
     */
    const response = await request.get('/', { headers: { accept: 'text/markdown' } });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/text\/markdown/);
    expect(response.headers().link ?? '').toContain('rel="api-catalog"');
    expect(linkBytes(response), 'Link header on the markdown twin').toBeLessThan(CEILING);
  });
});
