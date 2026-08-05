import { copy } from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';
import { AGENT_SKILLS, skillPath } from '@/lib/agents/skills';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getNewsListOrEmpty } from '@/lib/news';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * `/llms.txt` — llmstxt.org.
 *
 * Not part of the readiness scan that prompted this work, and included anyway
 * because it is the one file in this set that today's assistants actually
 * look for. The rest of the well-known documents are correct and mostly
 * aspirational; this one gets read.
 *
 * The course list is LIVE (`getCatalogOrEmpty`), not a static block. A
 * hand-maintained list of courses in a file nobody opens is a list that is
 * wrong within a month — and being wrong here means an assistant confidently
 * recommending a course that was unpublished, or missing the one just added.
 */

const url = (path: string): string => `${SITE_URL}${path}`;

export async function GET(): Promise<Response> {
  // Same failure posture as the sitemap and the landing page: an API blip
  // must degrade this file to "no course list", never to a 500. A 500 here
  // teaches a crawler the URL is broken and it may not come back soon.
  const { courses } = await getCatalogOrEmpty();
  const { posts } = await getNewsListOrEmpty();

  const courseLines = courses.map(
    (course) => `- [${course.title}](${url(`/courses/${course.slug}`)}): ${course.subjectNameAr} · ${course.lessonCount} ${copy.catalog.lessonCount}`,
  );

  const lines = [
    `# ${copy.site.platformName}`,
    '',
    `> ${copy.site.tagline}. ${copy.seo.description}`,
    '',
    'Arabic (RTL) throughout. Course titles, subjects and tracks are Arabic and should be',
    'quoted as they are rather than transliterated.',
    '',
    '## Pages',
    '',
    `- [الرئيسية](${url('/index.md')}): ${copy.landing.heroLead}`,
    `- [${copy.catalog.title}](${url('/courses.md')}): ${copy.catalog.subtitle}`,
    `- [${copy.landing.aboutPageTitle}](${url('/about.md')}): ${copy.landing.aboutPageLead}`,
    `- [${copy.essentials.title}](${url('/essentials.md')}): ${copy.essentials.listLead}`,
    `- [${copy.news.title}](${url('/news.md')}): ${copy.news.subtitle}`,
    `- [${copy.years.year1}](${url('/years/1.md')})`,
    `- [${copy.years.year2}](${url('/years/2.md')})`,
    `- [${copy.years.year3}](${url('/years/3.md')})`,
    '',
    '## Courses',
    '',
    ...(courseLines.length > 0 ? courseLines : [`- ${copy.catalog.empty}`]),
    '',
    '## Articles',
    '',
    // Evergreen teaching content, listed individually because each article is
    // a page an assistant may want to cite directly rather than a section it
    // should summarise.
    ...(posts.length > 0
      ? posts.map((post) => `- [${post.title}](${url(`/news/${post.slug}.md`)}): ${post.excerpt}`)
      : [`- ${copy.news.empty}`]),
    '',
    '## API',
    '',
    `- [OpenAPI 3.1](${url(AGENT_DISCOVERY_PATHS.serviceDesc)}): machine-readable description of the public catalog API`,
    `- [API docs](${url(AGENT_DISCOVERY_PATHS.serviceDoc)}): the same thing in prose`,
    `- [API catalog](${url(AGENT_DISCOVERY_PATHS.apiCatalog)}): RFC 9727 linkset`,
    `- [Authentication](${url(AGENT_DISCOVERY_PATHS.authDoc)}): what is open, what needs a session, and why there are no agent credentials`,
    '',
    '## Skills',
    '',
    ...AGENT_SKILLS.map((skill) => `- [${skill.name}](${url(skillPath(skill.name))}): ${skill.description}`),
    '',
    '## Optional',
    '',
    `- [Sitemap](${url(AGENT_DISCOVERY_PATHS.sitemap)})`,
    `- [robots.txt](${url('/robots.txt')}): content signals — search=yes, ai-input=yes, ai-train=no`,
    '',
    '## Terms',
    '',
    'You may read these pages to answer a question and cite them with a link back.',
    'You may not use this content to train or fine-tune a model — it is the instructor\'s',
    'livelihood, and permission is withheld explicitly, not by omission.',
    '',
    copy.agents.contentNote,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600',
    },
  });
}
