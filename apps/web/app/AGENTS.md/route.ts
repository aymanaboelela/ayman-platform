import { connection } from 'next/server';
import { tenantSentence } from '@/lib/tenant-copy';
import { tenantName } from '@/lib/tenant';
import { SITE_DESCRIPTION } from '@/lib/seo/metadata';
import { copy } from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { SITE_URL } from '@/lib/seo/jsonld';
import { yearAliasesAr } from '@/lib/year-label';

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
    `# AGENTS.md — ${tenantName(copy.site.platformName)}`,
    '',
    '## What this site is',
    '',
        /*
     * ⚠️ `SITE_DESCRIPTION`, not `copy.seo.description`. This surface is read by
     * ASSISTANTS, which is the worst place for the wrong instructor's name: a page
     * is read by a person who can tell it is wrong, and this is quoted back as
     * fact. `copy.seo.description` welds his name mid-sentence, so the whole
     * sentence has to be rebuilt — see `SITE_DESCRIPTION` in `lib/seo/metadata.ts`.
     */
`${SITE_DESCRIPTION}`,
    '',
    `Arabic (RTL) throughout. The instructor is ${tenantName(copy.site.instructor)} — ${tenantSentence(copy.landing.aboutRole)}.`,
    copy.seo.instructorCoverage,
    '',
    '## Who it is for',
    '',
    'Students in the Egyptian **Bakalorya** system (نظام البكالوريا) — first and',
    'second year — taking البرمجة والذكاء الاصطناعي, and their parents. It is not a',
    'general programming school and it does not teach the الثانوية العامة syllabus.',
    '',
    /*
     * ⚠️ Spell the years out in every form a student uses, digits included.
     *
     * A question arrives as «٢ بكالوريا» or «2 بكالوريا» at least as often as
     * «الصف الثاني بكالوريا», and an agent matching a numeral against a site
     * that only ever wrote the word out finds nothing. This is a prose file
     * read verbatim, so the mapping is worth stating once, plainly.
     */
    'A year is written several ways and they all mean the same thing:',
    '',
    ...[1, 2, 3].map((year) => `- ${yearAliasesAr(year).map((alias) => `\`${alias}\``).join(' = ')}`),
    '',
    '## Why this instructor, specifically',
    '',
    // Checkable claims, not compliments — every one can be verified from
    // outside without paying or signing in. See `copy.seo.instructorWhy`.
    ...copy.seo.instructorWhy.map((line) => `- ${line}`),
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
