import { copy } from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS, PUBLIC_API_ENDPOINTS } from '@/lib/agents/discovery';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * `service-doc` — the prose companion to `/openapi.json`.
 *
 * Markdown rather than an HTML page, and that is a deliberate scope decision:
 * an HTML route would join `apps/web/e2e/a11y.e2e.ts`'s hand-maintained list,
 * need a `loading.tsx` (`lib/loading-coverage.test.ts`), and put an
 * English-language developer page inside an Arabic-only product surface. None
 * of that serves the reader, who is either an agent or a developer with curl.
 *
 * The endpoint list is generated from `PUBLIC_API_ENDPOINTS`, the same array
 * `/openapi.json` and the skills read — so this document cannot describe a
 * route the OpenAPI description omits, which is the usual way prose docs rot.
 */

const url = (path: string): string => `${SITE_URL}${path}`;

function body(): string {
  const endpoints = PUBLIC_API_ENDPOINTS.map(
    (endpoint) => `### \`GET ${endpoint.path}\`\n\n${endpoint.summary}\n\n\`\`\`\ncurl ${url(endpoint.path)}\n\`\`\``,
  ).join('\n\n');

  return `# ${copy.site.platformName} — public API

Read-only access to the published course catalog. No key, no session, no CORS
preflight to worry about — these are the same endpoints the site's own pages read.

- Machine-readable: ${url(AGENT_DISCOVERY_PATHS.serviceDesc)} (OpenAPI 3.1)
- Catalog: ${url(AGENT_DISCOVERY_PATHS.apiCatalog)} (RFC 9727)
- Auth: ${url(AGENT_DISCOVERY_PATHS.authDoc)} — there is none to obtain
- Status: ${url(AGENT_DISCOVERY_PATHS.status)}

All responses are JSON, UTF-8, Arabic content. Base URL is this origin — the API is
not addressable on any other host.

## Endpoints

${endpoints}

## Rate limits

Generous on the catalog routes, ordinary elsewhere. Cache the course list rather than
polling it: it changes when a course is published, which is rare, and every response
carries \`updatedAt\` per course so you can tell cheaply whether anything moved.

## What is not here

Lesson video ids, attachments, quiz questions, attempts, progress and every admin
route. These are absent from the published contract rather than filtered out of it, so
there is no parameter that reveals them and no credential that unlocks them.
${copy.agents.contentNote}

## Prefer markdown to JSON?

Every public page also answers to \`Accept: text/markdown\` or a \`.md\` suffix:

\`\`\`
curl -H 'Accept: text/markdown' ${url('/courses')}
curl ${url('/courses.md')}
\`\`\`

Start at ${url(AGENT_DISCOVERY_PATHS.llms)}.
`;
}

export function GET(): Response {
  return new Response(body(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
