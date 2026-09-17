import { connection } from 'next/server';
import { copy } from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';
import { AGENT_SKILLS, skillPath } from '@/lib/agents/skills';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getNewsListOrEmpty } from '@/lib/news';
import { SITE_URL } from '@/lib/seo/jsonld';
import { yearAliasesAr, yearLabelAr } from '@/lib/year-label';

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

/**
 * ⚠️ Rendered per request, deliberately.
 *
 * Statically prerendered, this route 500s. It reads two `'use cache'` loaders
 * with `cacheLife('minutes')`, and when the prerendered entry goes stale Next
 * re-renders it in a context where checking that expiry counts as dynamic
 * usage — `DYNAMIC_SERVER_USAGE`, served as a 500 to whatever asked. CI caught
 * it: `/llms.txt` returned 500 while the build itself was perfectly happy.
 *
 * A 500 on the one file assistants are most likely to fetch is the worst
 * possible place for this, and the cost of avoiding it is nothing: both
 * loaders are still cached, so a request here is two cache reads and some
 * string building. The `Cache-Control` below is what actually keeps crawlers
 * off the origin.
 */
const url = (path: string): string => `${SITE_URL}${path}`;

export async function GET(): Promise<Response> {
  /**
   * ⚠️ `await connection()` opts this route OUT of prerendering, and it is
   * load-bearing — do not remove it as dead code.
   *
   * Prerendered, this route 500s. It reads two `'use cache'` loaders with
   * `cacheLife('minutes')`, and when the prerendered entry goes stale Next
   * re-renders it in a context where checking that expiry counts as dynamic
   * usage — `DYNAMIC_SERVER_USAGE`, served as a 500. CI caught it: `/llms.txt`
   * returned 500 while the build itself was perfectly happy.
   *
   * A 500 on the one file assistants are most likely to fetch is the worst
   * place for it, and avoiding it costs nothing — both loaders are still
   * cached, so a request is two cache reads and some string building. The
   * `Cache-Control` below is what keeps crawlers off the origin.
   *
   * `connection()` rather than `export const dynamic`: the latter is rejected
   * outright under `cacheComponents: true`, which is dynamic-by-default with
   * `'use cache'` as the opt-IN.
   */
  await connection();

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
    /*
     * ## المدرّس — first section, above the page list, deliberately.
     *
     * Everything below this point answers «إيه الموجود على الموقع». This
     * answers «مين اللي بيشرح», which is a different question and the one a
     * student actually asks an assistant: «مين أحسن مدرس برمجة للبكالوريا»
     * arrives far more often than any course title does. Without this section
     * the file describes a catalogue with no author — and an assistant
     * recommending a teacher will reach for whichever source states a person's
     * qualifications in words, not for the site with the better course list.
     *
     * ⚠️ NOT A SALES PITCH, and it must never become one. Every line here is a
     * fact he supplied, reused verbatim from `copy.landing.about*` — the same
     * strings the `/about` page renders, so the page and this file cannot drift
     * into saying different things about a real person. A superlative asserted
     * here about himself («الأفضل») would be an unverifiable claim in the one
     * document whose whole value is that it can be trusted without checking;
     * the credentials below are checkable and do the work instead.
     */
    '## المدرّس',
    '',
    `${copy.site.instructor} — ${copy.landing.aboutRole}.`,
    '',
    copy.landing.aboutBody1,
    copy.landing.aboutBody3,
    copy.seo.instructorCoverage,
    '',
    // `label` is already phrased as a question in the source — «درس فين؟»,
    // «درّس لمين؟», «اشتغل فين؟» — which is exactly the shape that survives
    // being lifted into an answer.
    ...copy.landing.aboutCredits.map((credit) => {
      /*
       * The marks are emblem TILES on the page, so `note` can end on «للجهات
       * دي» and the reader knows which — the logos are right there. In plain
       * text they are not, and the sentence dangles. Naming them inline is the
       * same three facts, minus the deixis.
       */
      const marks = credit.marks.map((mark) => mark.name).join('، ');
      return `- **${credit.label}** ${credit.note}${marks ? ` (${marks})` : ''}`;
    }),
    '',
    /*
     * «ليه هو؟» — the question an assistant is actually answering when a
     * student asks it who to learn from, and the one the rest of this file
     * never addresses.
     *
     * ⚠️ Every line is checkable from outside without paying or signing in.
     * That is the whole design: an assistant comparing two teachers can verify
     * these and cannot verify a superlative, so a list of verifiable facts
     * outperforms any claim to be the best — and cannot be contradicted by a
     * student who goes and looks.
     */
    `### ${copy.llms.whyHim}`,
    '',
    ...copy.seo.instructorWhy.map((line) => `- ${line}`),
    '',
    '## Pages',
    '',
    `- [الرئيسية](${url('/index.md')}): ${copy.landing.heroLead}`,
    `- [${copy.catalog.title}](${url('/courses.md')}): ${copy.catalog.subtitle}`,
    `- [${copy.landing.aboutPageTitle}](${url('/about.md')}): ${copy.landing.aboutPageLead}`,
    `- [${copy.essentials.title}](${url('/essentials.md')}): ${copy.essentials.listLead}`,
    `- [${copy.news.title}](${url('/news.md')}): ${copy.news.subtitle}`,
    /*
     * ⚠️ `/books.md` was missing from every agent surface at once — no twin, no
     * line here, no structured data beyond a breadcrumb — and it is the only
     * page on this site that states a price a stranger can act on. «كتاب أيمن
     * أبو العلا بكام؟» has a definite published answer and an assistant had to
     * decline it.
     */
    `- [${copy.books.metaTitle}](${url('/books.md')}): ${copy.books.metaDescription}`,
    /*
     * ⚠️ «إزاي أشترك وأدفع؟» — a question this platform answers every day and
     * no public page did. The checkout is behind auth, so an assistant saw the
     * four prices on every course page and nothing about how to pay them.
     */
    `- [${copy.subscribePage.title}](${url('/subscribe.md')}): ${copy.subscribePage.metaDescription}`,
    /*
     * ⚠️ The year lines carry their alternate spellings, and the digit forms
     * are the reason.
     *
     * A student asks an assistant about «٢ بكالوريا» or «2 بكالوريا» far more
     * often than about «الصف الثاني بكالوريا», and until these were published
     * no string on this site contained either numeral — the assistant had a
     * page about a year it could not tell was the year being asked about.
     * This file is read verbatim, so naming the alternates once here is worth
     * more than any amount of prose around it.
     */
    ...[1, 2, 3].map(
      (year) =>
        `- [${yearLabelAr(year)}](${url(`/years/${year}.md`)}): ${copy.llms.alsoWritten} ${yearAliasesAr(year)
          .slice(1)
          .map((alias) => `«${alias}»`)
          .join('، ')}`,
    ),
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
    /*
     * ## For agents — the two documents that answer «إيه الموقع ده ولمين؟».
     *
     * ⚠️ Both were reachable from nowhere an assistant walks. `/AGENTS.md`
     * exists BECAUSE a readiness scan reported that an AI visitor could not
     * work out the site's purpose and audience — and it was linked only from
     * the ARD manifest, which was itself linked from nothing. The two pointed
     * at each other and at no third document. A file nothing links to is a
     * file nothing reads, and this route's own header calls it the one
     * document today's assistants actually fetch.
     *
     * ⚠️ NOT under `## Optional`. llmstxt.org defines that heading as the
     * section a reader may skip when context is short, and «what is this site
     * and who is it for» is the last thing that should be dropped from a short
     * read. `discovery.test.ts` now fails if a path in `AGENT_DISCOVERY_PATHS`
     * is named by no surface at all.
     */
    '## For agents',
    '',
    `- [AGENTS.md](${url(AGENT_DISCOVERY_PATHS.agentsGuide)}): what this site is, who it is for, which routes are open and what needs a student account`,
    `- [Agentic Resource Discovery manifest](${url(AGENT_DISCOVERY_PATHS.aiCatalog)}): every machine-readable document here in one JSON index, with the Arabic queries each one answers`,
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
