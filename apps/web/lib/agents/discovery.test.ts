import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_DISCOVERY_PATHS, PUBLIC_API_ENDPOINTS, buildAgentLinkHeader } from './discovery';

/**
 * RFC 8288 §3: `Link: <target>; param=value`, comma-separated. A header that
 * parses wrong is a header every agent silently ignores — there is no error to
 * observe, which is why the shape is asserted here rather than eyeballed once.
 */
function parseLinkHeader(header: string): { target: string; rel: string; type?: string }[] {
  return header.split(', ').map((entry) => {
    const match = /^<([^>]+)>; rel="([^"]+)"(?:; type="([^"]+)")?$/.exec(entry);
    const target = match?.[1];
    const rel = match?.[2];
    if (!target || !rel) throw new Error(`unparseable Link entry: ${entry}`);
    return { target, rel, type: match[3] };
  });
}

describe('AGENT_DISCOVERY_PATHS', () => {
  it('is all absolute-path references, never absolute URLs', () => {
    for (const path of Object.values(AGENT_DISCOVERY_PATHS)) {
      expect(path.startsWith('/')).toBe(true);
      expect(path).not.toMatch(/^https?:/);
    }
  });
});

describe('buildAgentLinkHeader', () => {
  it('parses as a valid RFC 8288 header', () => {
    expect(() => parseLinkHeader(buildAgentLinkHeader(null))).not.toThrow();
  });

  it('advertises the api-catalog relation the readiness scan looks for', () => {
    const links = parseLinkHeader(buildAgentLinkHeader(null));
    const catalog = links.find((link) => link.rel === 'api-catalog');
    expect(catalog?.target).toBe(AGENT_DISCOVERY_PATHS.apiCatalog);
    expect(catalog?.type).toBe('application/linkset+json');
  });

  it('uses only IANA-registered relation types', () => {
    // An unregistered `rel` is a string no agent has a reason to understand.
    const registered = new Set([
      'api-catalog',
      'service-desc',
      'service-doc',
      'status',
      'describedby',
      'sitemap',
      'alternate',
    ]);
    for (const link of parseLinkHeader(buildAgentLinkHeader('/courses.md'))) {
      expect(registered).toContain(link.rel);
    }
  });

  it('points every relation at a path that is in the single source of truth', () => {
    const known = new Set<string>(Object.values(AGENT_DISCOVERY_PATHS));
    for (const link of parseLinkHeader(buildAgentLinkHeader(null))) {
      expect(known).toContain(link.target);
    }
  });

  it('adds the markdown alternate only when the page has one', () => {
    expect(buildAgentLinkHeader(null)).not.toContain('rel="alternate"');

    const withTwin = parseLinkHeader(buildAgentLinkHeader('/courses.md'));
    const alternate = withTwin.find((link) => link.rel === 'alternate');
    expect(alternate).toEqual({ target: '/courses.md', rel: 'alternate', type: 'text/markdown' });
  });
});

describe('the Cloudflare edge rule', () => {
  /**
   * `deploy/cloudflare/link-header.json` carries the same relation list as a
   * literal string, because Cloudflare cannot import a TypeScript function.
   *
   * That literal is the one copy of this value that CI cannot see fall out of
   * date — the app is what renames a route, and the edge rule would keep
   * pointing agents at the old path with nothing failing anywhere. Hence this
   * test. It is the reason the JSON file is safe to have at all.
   *
   * Why the header is published from Cloudflare and not from this app at all:
   * every in-app mechanism folds the value into the cached page shell and
   * re-adds it on each revalidation — see the header comment in
   * `deploy/cloudflare/apply-link-header.mjs` for the measurements, and the
   * `page responses carry no discovery relations in the Link header` guard in
   * `e2e/agent-discovery.e2e.ts` for the assertion that this app never does.
   */
  const edge = JSON.parse(
    readFileSync(path.join(import.meta.dirname, '../../../../deploy/cloudflare/link-header.json'), 'utf8'),
  ) as { header: string; operation: string; value: string; expression: string };

  it('publishes byte-identical relations to the ones the app builds', () => {
    expect(edge.value).toBe(buildAgentLinkHeader(null));
  });

  it('adds the header rather than replacing it', () => {
    // `set` would drop Next's own `Link` — the six woff2 font preloads it
    // serves on `/`, which are the most expensive bytes on the page to lose.
    expect(edge.header).toBe('Link');
    expect(edge.operation).toBe('add');
  });

  it('is scoped to the homepage, not the whole site', () => {
    /*
     * Signed-in surfaces must not advertise the catalog: they carry
     * `X-Robots-Tag: noindex`, and asking an agent not to look while handing it
     * a catalog is a contradiction (`e2e/agent-discovery.e2e.ts` asserts the
     * same thing about the document links). A path-prefix match would sweep
     * `/dashboard` in; an equality match cannot.
     */
    expect(edge.expression).toContain('http.request.uri.path eq "/"');
  });

  it('carries at least one relation the readiness scan counts', () => {
    // Observed scanner behaviour: only these four are treated as agent-useful.
    // `sitemap` and `status` are ignored, so a header of only those would be
    // served, parsed, and still reported as a failure.
    const counted = ['api-catalog', 'service-desc', 'service-doc', 'describedby'];
    expect(counted.some((rel) => edge.value.includes(`rel="${rel}"`))).toBe(true);
  });
});

describe('PUBLIC_API_ENDPOINTS', () => {
  /**
   * The promise this array makes. Every entry is `@Public()` on the Nest side;
   * an admin or student route slipping in here would publish a 401 as though
   * it were an API — and `robots.txt`'s `Allow` list would then invite
   * crawlers to it.
   */
  it('only names routes under the known public prefixes', () => {
    const publicPrefixes = ['/api/catalog/', '/api/taxonomy', '/api/health'];
    for (const endpoint of PUBLIC_API_ENDPOINTS) {
      expect(publicPrefixes.some((prefix) => endpoint.path.startsWith(prefix))).toBe(true);
    }
  });

  it('has unique operation ids, since OpenAPI keys on them', () => {
    const ids = PUBLIC_API_ENDPOINTS.map((endpoint) => endpoint.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
