import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * Agent discovery — every well-known path this site advertises, in ONE place.
 *
 * The same reasoning as `lib/cache-tags.ts`: these paths are written down in
 * at least five files that must agree (the `Link` header in `proxy.ts`, the
 * linkset at `/.well-known/api-catalog`, `/llms.txt`, the skills index, and
 * `robots.txt`). A path written as a literal in five files will diverge, and
 * every one of these failures is SILENT — an agent follows a `rel="service-desc"`
 * link to a 404 and simply concludes the site has no API description. Nothing
 * in CI would notice, which is exactly why `discovery.test.ts` asserts that
 * every path here is a route that exists.
 *
 * What this is for: the site is Arabic, RTL, and sells courses to Egyptian
 * Bakalorya students. Its growth surface is no longer only Google — it is also
 * an assistant being asked «منهج الحاسب للبكالوريا فين». These files are how
 * that assistant finds the catalog, reads it without executing our JavaScript,
 * and links back here.
 */

/**
 * ⚠️ Paths, not URLs. A `Link` header may carry a relative reference (RFC 8288
 * §3 resolves it against the request URL), and keeping these relative is what
 * lets the header be byte-identical on every host — production, a preview
 * deploy, and `localhost:3200` — with no environment variable in the hot path
 * of every response. `absoluteDiscoveryUrl()` below is for the documents that
 * genuinely require absolute URLs (the linkset's `anchor`, per RFC 9264).
 */
export const AGENT_DISCOVERY_PATHS = {
  /** RFC 9727 — the machine-readable index of this site's APIs. */
  apiCatalog: '/.well-known/api-catalog',
  /** Agent Skills Discovery RFC v0.2.0. */
  agentSkills: '/.well-known/agent-skills/index.json',
  /** RFC 8631 `service-desc` — the OpenAPI document itself. */
  serviceDesc: '/openapi.json',
  /** RFC 8631 `service-doc` — the human/agent-readable prose version. */
  serviceDoc: '/docs/api',
  /** How an agent authenticates here, and — honestly — that it mostly cannot. */
  authDoc: '/auth.md',
  /** llmstxt.org — the plain-text map an assistant reads first. */
  llms: '/llms.txt',
  sitemap: '/sitemap.xml',
  /**
   * RFC 8631 `status`. This is the API's own health route, reachable through
   * the `/api/*` rewrite like everything else the browser sees — see
   * `next.config.ts`. It is `@Public()` on the Nest side.
   */
  status: '/api/health',
} as const;

export type AgentDiscoveryKey = keyof typeof AGENT_DISCOVERY_PATHS;

/** For documents that must carry absolute URLs — linksets, the skills index. */
export function absoluteDiscoveryUrl(key: AgentDiscoveryKey): string {
  return `${SITE_URL}${AGENT_DISCOVERY_PATHS[key]}`;
}

/**
 * The public read-only API, described once. Feeds `/openapi.json`, the
 * linkset, `/docs/api` and `/llms.txt` — four documents that would otherwise
 * each carry their own hand-copied list of endpoints and drift apart the first
 * time a route is renamed.
 *
 * ⚠️ Membership here is a PROMISE: everything listed is `@Public()` on the
 * Nest side, returns no per-user state, and needs no credential. Adding a
 * session-gated route to this array publishes a 401 as though it were an API.
 * The authorization matrix (`apps/api/src/test/authorization-matrix.int-spec.ts`)
 * is what proves the `@Public()` half; `discovery.test.ts` proves this array
 * only ever names routes from that set.
 */
export interface PublicApiEndpoint {
  path: string;
  summary: string;
  /** Rendered into the OpenAPI `operationId` and the skills index. */
  operationId: string;
}

export const PUBLIC_API_ENDPOINTS: readonly PublicApiEndpoint[] = [
  {
    path: '/api/catalog/courses',
    operationId: 'listCourses',
    summary: 'Every published course: title, slug, year, subject, track, duration and lesson count.',
  },
  {
    path: '/api/catalog/courses/{slug}',
    operationId: 'getCourse',
    summary: 'One published course in full, including its section and lesson outline.',
  },
  {
    path: '/api/taxonomy',
    operationId: 'getTaxonomy',
    summary:
      "The curriculum's shape: Egypt's 27 governorates, both school systems, their tracks and subjects.",
  },
  {
    path: '/api/health',
    operationId: 'getHealth',
    summary: 'Liveness probe. 200 with a JSON body when the API and its database are reachable.',
  },
] as const;

/**
 * RFC 8288 `Link` header value.
 *
 * Every entry is a relation registered with IANA — an unregistered `rel` is a
 * string an agent has no reason to understand, which defeats the point of
 * emitting the header at all. `type` is included wherever the target is not
 * HTML so an agent can decide whether to fetch it before spending the request.
 *
 * `markdownPath` is per-request rather than a constant: it advertises THIS
 * page's markdown twin (`rel="alternate"`), which is what tells an agent that
 * `Accept: text/markdown` will be honoured here — see `lib/agents/markdown.ts`.
 * Passing `null` (for a route with no markdown rendering) simply omits it
 * rather than advertising a URL that would 404.
 */
export function buildAgentLinkHeader(markdownPath: string | null): string {
  const links = [
    `<${AGENT_DISCOVERY_PATHS.apiCatalog}>; rel="api-catalog"; type="application/linkset+json"`,
    `<${AGENT_DISCOVERY_PATHS.serviceDesc}>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.1"`,
    `<${AGENT_DISCOVERY_PATHS.serviceDoc}>; rel="service-doc"; type="text/markdown"`,
    `<${AGENT_DISCOVERY_PATHS.status}>; rel="status"; type="application/json"`,
    `<${AGENT_DISCOVERY_PATHS.llms}>; rel="describedby"; type="text/plain"`,
    `<${AGENT_DISCOVERY_PATHS.agentSkills}>; rel="describedby"; type="application/json"`,
    `<${AGENT_DISCOVERY_PATHS.sitemap}>; rel="sitemap"; type="application/xml"`,
  ];

  if (markdownPath) {
    links.push(`<${markdownPath}>; rel="alternate"; type="text/markdown"`);
  }

  return links.join(', ');
}
