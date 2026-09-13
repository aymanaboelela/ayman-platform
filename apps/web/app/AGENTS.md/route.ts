import { connection } from 'next/server';
import { copy } from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * `/AGENTS.md` — the prose guide, for an agent that arrived at the site
 * without reading a single machine-readable document.
 *
 * ⚠️ This is NOT the repository's `AGENTS.md`. That one is instructions for a
 * coding agent working on this codebase; this one is served over HTTP and
 * describes the PRODUCT to an agent acting for a student. They share a filename
 * and nothing else, and neither should ever be made to serve the other's
 * purpose.
 *
 * Why it exists when `/llms.txt` already does: the readiness scan on
 * 2026-09-13 reported that an AI visitor "could not understand the site's
 * purpose and audience". `/llms.txt` is a map — mostly links — and a map
 * answers «what is here», not «who is this for and what may I do with it».
 * This file answers the second question in four short sections and then hands
 * over to the documents that hold the data.
 *
 * ⚠️ Rendered per request for the same reason as `/llms.txt`: it reads a
 * `cacheLife('minutes')` loader, and a prerendered entry that goes stale
 * re-renders as `DYNAMIC_SERVER_USAGE` — a 500 on one of the two files an
 * assistant is most likely to fetch. `connection()` is load-bearing; the
 * loader underneath is still cached, so a request here is one cache read.
 */
const url = (path: string): string => `${SITE_URL}${path}`;

export async function GET(): Promise<Response> {
  await connection();

  // Same failure posture as the sitemap and llms.txt: an API blip degrades
  // this to "no course list", never to a 500.
  const { courses } = await getCatalogOrEmpty();

  const lines = [
    `# AGENTS.md — ${copy.site.platformName}`,
    '',
    '## What this site is',
    '',
    `${copy.seo.description}`,
    '',
    `Arabic (RTL) throughout. The instructor is ${copy.site.instructor} — ${copy.landing.aboutRole}.`,
    copy.seo.instructorCoverage,
    '',
    '## Who it is for',
    '',
    'Students in the Egyptian **Bakalorya** system (نظام البكالوريا) — first and',
    'second year — taking البرمجة والذكاء الاصطناعي, and their parents. It is not a',
    'general programming school and it does not teach the الثانوية العامة syllabus.',
    '',
    '## What you may do without a credential',
    '',
    '- Read any public page. Append `.md` to a URL, or send `Accept: text/markdown`,',
    '  to get clean markdown instead of HTML.',
    `- Call the read-only catalog API — see [${AGENT_DISCOVERY_PATHS.serviceDesc}](${url(AGENT_DISCOVERY_PATHS.serviceDesc)}).`,
    `- Cite any of it, with a link back. Training on it is refused — see [/robots.txt](${url('/robots.txt')}).`,
    '',
    '## What you cannot do, by any means',
    '',
    'Lessons, videos, files, quizzes and results are gated behind a student account',
    'and an enrolment. **No API key, OAuth client or agent credential exists** — none',
    'is issued, so there is nothing to request and no flow to complete. If a student',
    "asks you to reach their own course content, the answer is that they sign in",
    `themselves. Details: [${AGENT_DISCOVERY_PATHS.authDoc}](${url(AGENT_DISCOVERY_PATHS.authDoc)}).`,
    '',
    '## Where to look next',
    '',
    `- [${AGENT_DISCOVERY_PATHS.llms}](${url(AGENT_DISCOVERY_PATHS.llms)}) — every page, course and article, one line each.`,
    `- [${AGENT_DISCOVERY_PATHS.aiCatalog}](${url(AGENT_DISCOVERY_PATHS.aiCatalog)}) — the same documents as an ARD manifest.`,
    `- [${AGENT_DISCOVERY_PATHS.agentSkills}](${url(AGENT_DISCOVERY_PATHS.agentSkills)}) — skills for browsing the catalog and reading pages as markdown.`,
    `- [${AGENT_DISCOVERY_PATHS.sitemap}](${url(AGENT_DISCOVERY_PATHS.sitemap)}) — every public URL with its last-modified date.`,
    '',
    '## Published courses',
    '',
    ...(courses.length > 0
      ? courses.map(
          (course) =>
            `- [${course.title}](${url(`/courses/${course.slug}`)}) — ${course.subjectNameAr}, ${course.lessonCount} ${copy.catalog.lessonCount}`,
        )
      : [`- ${copy.catalog.empty}`]),
    '',
  ];

  return new Response(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
