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
