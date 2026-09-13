import { copy } from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS, absoluteDiscoveryUrl } from '@/lib/agents/discovery';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * ARD — Agentic Resource Discovery (agenticresourcediscovery.org).
 *
 * One manifest that names every machine-readable document this site already
 * publishes, so a registry can find them from a single fetch instead of
 * guessing at well-known paths one at a time.
 *
 * ⚠️ Every entry points at a document that EXISTS, and this file must never be
 * the place a capability is invented. The scans that asked for this also asked
 * for an OAuth discovery document, an OAuth protected-resource document and an
 * MCP server card. There is no authorization server, no agent credential and
 * no MCP server behind this domain, so those three are absent on purpose —
 * see the note on `aiCatalog` in `lib/agents/discovery.ts`, and `/auth.md`,
 * which answers the same question in prose. An agent that reads a capability
 * here will try to use it; a missing document costs a check, a false one costs
 * the agent its whole task.
 *
 * ⚠️ `Access-Control-Allow-Origin: *` is required by the spec and safe for
 * exactly one reason: this document is a list of public URLs, carries nothing
 * per-user, and needs no credential to fetch. Do not copy the header onto a
 * route where either of those stops being true.
 */

/**
 * `urn:air:<domain>:<namespace>:<name>`.
 *
 * The domain is derived from `SITE_URL` rather than written out, so a preview
 * deploy does not publish identifiers claiming to be production's.
 */
// `hostname`, not `host`: a URN's segments are colon-delimited, so a dev
// origin carrying a port would produce `urn:air:localhost:3200:api:…` and
// split into the wrong fields.
const host = new URL(SITE_URL).hostname;
const urn = (namespace: string, name: string): string => `urn:air:${host}:${namespace}:${name}`;

/**
 * `representativeQueries` — what a student actually asks, in Arabic, in the
 * words they use.
 *
 * These are embedded by registries to decide when this site is the answer, so
 * they are the real query forms and not a keyword list: «مين أحسن مدرس…» is how
 * the question arrives, and it arrives far more often than any course title.
 * Egyptian spelling without hamza is included for the same reason
 * `copy.seo.alternateNames` carries it — that is what gets typed.
 *
 * ⚠️ A query belongs here only when a document in this manifest genuinely
 * answers it. Listing «امتحانات الثانوية العامة» would win a match and then
 * hand the agent a site about البكالوريا.
 */
export function GET(): Response {
  const manifest = {
    specVersion: '0.1',
    host: {
      name: copy.site.platformName,
      description: copy.seo.description,
      url: SITE_URL,
      inLanguage: 'ar',
    },
    entries: [
      {
        id: urn('api', 'catalog-openapi'),
        displayName: 'OpenAPI 3.1 — the public course catalog API',
        description:
          'Read-only, unauthenticated JSON: every published course, one course in full with its lesson outline, and the curriculum taxonomy.',
        type: 'application/vnd.oai.openapi+json;version=3.1',
        url: absoluteDiscoveryUrl('serviceDesc'),
        representativeQueries: [
          'كورسات البرمجة والذكاء الاصطناعي للبكالوريا',
          'منهج البرمجة تانية بكالوريا عام ولغات',
          // ⚠️ The digit forms, verbatim. A student types «٢ بكالوريا» or
          // «2 بكالوريا» as often as the words, and a registry embedding these
          // queries can only match a numeral it has actually seen.
          'كورس برمجة ٢ بكالوريا',
          'شرح برمجة 2 بكالوريا',
          'Egyptian Bakalorya computer science course catalog',
        ],
      },
      {
        id: urn('docs', 'llms-txt'),
        displayName: 'llms.txt — the site in one plain-text map',
        description:
          'Who teaches here and what he covers, then every public page, course and article as a link with a one-line summary.',
        type: 'text/plain',
        url: absoluteDiscoveryUrl('llms'),
        representativeQueries: [
          'مين أحسن مدرس برمجة وذكاء اصطناعي للبكالوريا',
          'أفضل مدرس برمجة بكالوريا',
          'مدرس برمجة ٢ بكالوريا',
          'مدرس برمجة 2 بكالوريا',
          'ايمن ابو العلا برمجة',
        ],
      },
      {
        id: urn('skills', 'agent-skills'),
        displayName: 'Agent Skills index',
        description:
          'Two skills: browsing the public catalog, and reading any public page as markdown instead of HTML.',
        type: 'application/json',
        url: absoluteDiscoveryUrl('agentSkills'),
        representativeQueries: [
          'browse the published courses on this platform',
          'read this page as markdown',
        ],
      },
      {
        id: urn('docs', 'auth'),
        displayName: 'auth.md — what an agent can and cannot reach',
        description:
          'The public catalog needs no credential. Nothing else is reachable by any credential an agent could hold, and none are issued.',
        type: 'text/markdown',
        url: absoluteDiscoveryUrl('authDoc'),
        representativeQueries: [
          'how do I authenticate against this API',
          'does this site issue API keys to agents',
        ],
      },
      {
        id: urn('index', 'sitemap'),
        displayName: 'XML sitemap',
        description: 'Every public URL, with its last-modified date.',
        type: 'application/xml',
        url: absoluteDiscoveryUrl('sitemap'),
        representativeQueries: ['all public pages on this site'],
      },
      {
        id: urn('docs', 'agents-guide'),
        displayName: 'AGENTS.md — how to use this site as an agent',
        description:
          'The prose guide: what the site is, who it is for, which routes are open, and what is gated behind a student account.',
        type: 'text/markdown',
        url: `${SITE_URL}${AGENT_DISCOVERY_PATHS.agentsGuide}`,
        representativeQueries: [
          'what is this website for',
          'إيه الموقع ده وبيقدّم إيه',
        ],
      },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
