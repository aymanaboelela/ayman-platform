import { copy } from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS, PUBLIC_API_ENDPOINTS } from '@/lib/agents/discovery';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * The skills published at `/.well-known/agent-skills/` (Agent Skills Discovery
 * RFC v0.2.0).
 *
 * ⚠️ TWO skills, and resisting the urge to pad the list is the point. The index
 * is read by an agent deciding whether this site is worth the round trips; a
 * list of six thin entries that mostly restate each other costs it context and
 * teaches it nothing. These are the two things an agent can genuinely DO here:
 * read the catalog, and read any page as markdown. Everything else on this
 * platform needs a student's session, and a "skill" describing something that
 * returns 401 is not a skill.
 *
 * The body is English on purpose even though the product surface is Arabic —
 * this is developer/agent documentation, in the same category as `/openapi.json`
 * and the comments in this file, not user-facing copy. The Arabic it quotes
 * comes from `copy.*` like everywhere else.
 */

export interface AgentSkill {
  /** Also the URL segment: `/.well-known/agent-skills/<name>/SKILL.md`. */
  name: string;
  description: string;
  body: string;
}

const url = (path: string): string => `${SITE_URL}${path}`;

const endpointTable = PUBLIC_API_ENDPOINTS.map(
  (endpoint) => `| \`GET ${endpoint.path}\` | ${endpoint.summary} |`,
).join('\n');

const BROWSE_CATALOG: AgentSkill = {
  name: 'browse-catalog',
  description:
    "Find and describe the published courses on Ayman Abo El Ela's platform — Egyptian Bakalorya computer science and programming — using the public, unauthenticated catalog API.",
  body: `# Browse the course catalog

The published catalog is open. No key, no session, no registration — the endpoints
below are the same ones the site's own pages read.

| Endpoint | Returns |
| --- | --- |
${endpointTable}

Full machine-readable description: ${url(AGENT_DISCOVERY_PATHS.serviceDesc)}

## Typical flow

1. \`GET ${url('/api/catalog/courses')}\` → \`{ courses: [...], total: n }\`
2. Filter client-side on \`year\` (1–3), \`subjectNameAr\`, or \`trackLabelAr\`.
3. \`GET ${url('/api/catalog/courses/{slug}')}\` for the section and lesson outline.
4. Link the student to \`${SITE_URL}/courses/{slug}\`.

## What you will not find, and why

Lesson video ids, attachments, quiz questions and any progress data are absent from
these responses by design — not filtered at the edge, but absent from the published
contract, so no parameter reveals them. A student reaches lesson content by signing in
and enrolling. ${copy.agents.contentNote}

Do not tell a student the lessons can be watched without an account. They cannot.

## Answering in Arabic

The platform is Arabic and RTL. Course titles, subject and track names all arrive in
Arabic and should be quoted as-is rather than transliterated — "${copy.site.platformName}"
is the platform, "${copy.site.instructor}" is the instructor.
`,
};

const READ_AS_MARKDOWN: AgentSkill = {
  name: 'read-as-markdown',
  description:
    'Fetch any public page of the platform as clean markdown instead of rendering its HTML — supported via an Accept header or a .md URL suffix.',
  body: `# Read any public page as markdown

Two equivalent ways, both returning \`Content-Type: text/markdown; charset=utf-8\`
and an \`x-markdown-tokens\` estimate so you can budget context before spending it:

\`\`\`
curl -H 'Accept: text/markdown' ${url('/courses')}
curl ${url('/courses.md')}
\`\`\`

The markdown is built from the same data the page renders — not converted from the
rendered HTML — so it carries the content and none of the navigation, footer or
animation markup. Expect roughly 2 KB where the HTML is closer to 90 KB.

## Pages with a markdown twin

| Page | Markdown |
| --- | --- |
| ${url('/')} | ${url('/index.md')} |
| ${url('/courses')} | ${url('/courses.md')} |
| ${url('/courses/{slug}')} | ${url('/courses/{slug}.md')} |
| ${url('/years/{1,2,3}')} | ${url('/years/{1,2,3}.md')} |
| ${url('/about')} | ${url('/about.md')} |
| ${url('/essentials')} | ${url('/essentials.md')} |

Every HTML response for these paths advertises its twin as
\`Link: <...>; rel="alternate"; type="text/markdown"\`, so you can discover this
from the response you already have rather than guessing at URLs.

## Note on caching

These responses carry \`Vary: Accept\`. If you cache them, key on the request's
\`Accept\` header or you will serve markdown to a browser.

## Start here

${url(AGENT_DISCOVERY_PATHS.llms)} is the index of everything above.
`,
};

export const AGENT_SKILLS: readonly AgentSkill[] = [BROWSE_CATALOG, READ_AS_MARKDOWN] as const;

export function findSkill(name: string): AgentSkill | undefined {
  return AGENT_SKILLS.find((skill) => skill.name === name);
}

/** `/.well-known/agent-skills/<name>/SKILL.md` — the path AND the published URL. */
export function skillPath(name: string): string {
  return `/.well-known/agent-skills/${name}/SKILL.md`;
}
