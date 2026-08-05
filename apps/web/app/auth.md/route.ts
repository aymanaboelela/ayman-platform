import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * `/auth.md` — the Auth.md convention (workos.com/auth.md).
 *
 * ⚠️ Read this before "completing" the OAuth items on any agent-readiness
 * report. The honest answer to "how does an agent authenticate here" is
 * **it does not**, and this file says so in as many words.
 *
 * The tempting alternative was to publish `/.well-known/openid-configuration`
 * and `/.well-known/oauth-authorization-server` so a scanner would go green.
 * That was declined deliberately, by the site owner, on 2026-08-05:
 *
 *   · This platform is an OAuth CLIENT (Google and Apple sign-in via
 *     better-auth), not an authorization SERVER. There is no `token_endpoint`,
 *     no `jwks_uri`, no client registration and no issuer.
 *   · Metadata pointing at endpoints that do not exist is not a formality —
 *     it is a published, signed-looking claim that agents can obtain tokens
 *     here. Every agent that believes it fails, and some will retry hard.
 *   · A green scanner result bought with a false statement about the security
 *     posture of a site that holds minors' accounts is a bad trade at any
 *     price.
 *
 * If a real agent-facing OAuth server is ever built (better-auth ships an OIDC
 * provider plugin), this file is where it gets described — and only then do
 * those two well-known documents get published.
 */

const url = (path: string): string => `${SITE_URL}${path}`;

const BODY = `# Authentication

**Short version: there is nothing to obtain.** This site issues no API keys, no OAuth
clients and no agent credentials. Its public data needs none, and its private data is
not reachable by any credential an agent could hold.

## The public API — open, no credential

| | |
| --- | --- |
| Auth | none |
| Methods | \`GET\` only |
| Catalog | ${url(AGENT_DISCOVERY_PATHS.apiCatalog)} |
| Description | ${url(AGENT_DISCOVERY_PATHS.serviceDesc)} |
| Docs | ${url(AGENT_DISCOVERY_PATHS.serviceDoc)} |

Sending an \`Authorization\` header changes nothing. It is not read on these routes.

Be reasonable about volume. The catalog routes are rate-limited generously because the
site's own build fetches them concurrently, but they are limited. Cache the catalog;
it changes when a course is published, not per request.

## Everything else — a student's session, and only a student's

Lesson video, attachments, quizzes, attempts, progress, profile and the whole admin
surface sit behind a session cookie held by a signed-in human, plus an active
enrolment in the specific course, plus a per-route permission check.

This is not a rate-limiting posture that a token would lift. There is no token. The
routes are deny-by-default and permission-based, and no permission in the system is
grantable to a non-human caller.

### If you are acting on behalf of a student

Do not attempt to sign in on their behalf, and do not ask them for their password.
Send them to the page:

- Sign in — ${url('/login')}
- Create an account — ${url('/register')}
- Courses — ${url('/courses')}

Accounts here belong to secondary-school students, many of them minors. A credential
typed into a chat window is a credential that has left their control.

## Registration for agents

None. There is no \`register_uri\`, no client registration flow, and no identity or
credential type an agent can request — because there is nothing behind it that a
credential would unlock.

## Machine-readable siblings

- ${url(AGENT_DISCOVERY_PATHS.llms)} — index of everything an agent can read here
- ${url(AGENT_DISCOVERY_PATHS.agentSkills)} — published skills
- ${url('/robots.txt')} — content signals: \`search=yes, ai-input=yes, ai-train=no\`

There is deliberately **no** \`/.well-known/openid-configuration\`,
\`/.well-known/oauth-authorization-server\` or \`/.well-known/oauth-protected-resource\`.
Their absence is the accurate signal: this origin is not an OAuth authorization server
and does not gate a token-protected resource. Publishing them to satisfy a checklist
would be a false statement about how this site can be accessed.
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
