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

test.describe('Link header', () => {
  test('the homepage advertises the api-catalog relation', async ({ request }) => {
    const response = await request.get('/');
    const link = response.headers().link;

    expect(link).toBeTruthy();
    // The exact finding the readiness scan reported: no Link headers on the
    // homepage, so no `rel="api-catalog"` to follow.
    expect(link).toContain('rel="api-catalog"');
    expect(link).toContain('</.well-known/api-catalog>');
    expect(link).toContain('rel="service-desc"');
    expect(link).toContain('rel="alternate"');
  });

  test('every advertised target actually resolves', async ({ request }) => {
    const link = (await request.get('/')).headers().link ?? '';
    const targets = [...link.matchAll(/<([^>]+)>/g)].map((match) => match[1] as string);

    expect(targets.length).toBeGreaterThan(4);

    for (const target of targets) {
      const response = await request.get(target);
      // A `Link` pointing at a 404 is worse than no `Link`: an agent spends
      // the round trip and concludes the capability does not exist.
      expect(response.status(), `${target} should not 404`).toBe(200);
    }
  });

  test('a signed-out protected route does not advertise the catalog', async ({ request }) => {
    // `/dashboard` redirects to /login for an anonymous visitor; neither the
    // redirect nor the login page should carry agent-discovery links while
    // also carrying `X-Robots-Tag: noindex`.
    const response = await request.get('/dashboard', { maxRedirects: 0 });
    expect(response.headers().link ?? '').not.toContain('api-catalog');
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
