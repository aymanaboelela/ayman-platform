import { copy } from '@ayman/contracts';
import type {
  CatalogCourse,
  CatalogCourseDetail,
  NewsListItem,
  NewsPostDetail,
} from '@ayman/contracts';
import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';
import { ESSENTIAL_TERMS } from '@/lib/essentials-terms';
import { foundationCoursesOutsideYear } from '@/lib/foundation-courses';
import { formatDuration } from '@/lib/format';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * The markdown rendering of every public page.
 *
 * ⚠️ This is not a second copy of the site's content — every Arabic string
 * below comes from `copy.*` or from the catalog API, the same two sources the
 * React pages read. That is the whole reason this is safe to maintain: a
 * retouched headline changes the page and its markdown twin together, and
 * there is no third place for the two to disagree.
 *
 * What it deliberately does NOT do is convert the rendered HTML. An
 * HTML→markdown pass would drag along the nav, the footer, the cookie of
 * decorative markup a marketing page carries, and the animation wrappers —
 * and it would break silently the next time a section is restyled. Building
 * from the data instead means an agent gets the ~2 KB that answer the
 * question rather than 90 KB of chrome.
 *
 * ⚠️ Nothing here may render lesson CONTENT. The catalog contract is already
 * the allowlist for what a stranger may see (no `videoExternalId`, see
 * `packages/contracts/src/catalog.ts`), and this file must not widen it — the
 * outline below lists lesson TITLES, which the public course page already
 * shows, and stops there. Markdown that is easier to scrape is not a licence
 * to publish more.
 */

/** Absolute, because a markdown document travels — it gets pasted, quoted, cached. */
const url = (path: string): string => `${SITE_URL}${path}`;

/** Drops empty entries so an absent subtitle never leaves a blank line pair. */
const join = (blocks: readonly (string | null | undefined)[]): string =>
  blocks.filter((block): block is string => Boolean(block && block.trim())).join('\n\n');

/**
 * The trailer every document carries: where the real page is, and what an
 * agent can and cannot reach without a student's session. Saying this once,
 * everywhere, is what stops an assistant confidently telling a student the
 * lessons are free to read.
 */
function footer(canonicalPath: string): string {
  const a = copy.agents;
  return join([
    '---',
    `**${a.sourcePage}:** ${url(canonicalPath)}`,
    `**${a.agentIndex}:** ${url(AGENT_DISCOVERY_PATHS.llms)} · **${a.publicApi}:** ${url(AGENT_DISCOVERY_PATHS.serviceDesc)}`,
    a.contentNote,
  ]);
}

/** A definition list, one fact per line — `join` is for BLOCKS, not rows. */
function courseMeta(course: CatalogCourse): string {
  const a = copy.agents;
  return [
    `- **${a.metaYear}:** ${yearLabel(course.year)}`,
    `- **${a.metaSubject}:** ${course.subjectNameAr}`,
    course.trackLabelAr ? `- **${a.metaTrack}:** ${course.trackLabelAr}` : null,
    `- **${a.metaSystem}:** ${course.systemNameAr}`,
    `- **${a.metaLessons}:** ${course.lessonCount} ${copy.catalog.lessonCount}`,
    `- **${copy.catalog.duration}:** ${formatDuration(course.totalSeconds)}`,
  ]
    .filter((row): row is string => row !== null)
    .join('\n');
}

function yearLabel(year: number): string {
  if (year === 1) return copy.years.year1;
  if (year === 2) return copy.years.year2;
  return copy.years.year3;
}

/** One line per course — enough for an agent to choose, short enough to list 40. */
function courseLine(course: CatalogCourse): string {
  const facts = [
    yearLabel(course.year),
    course.subjectNameAr,
    course.trackLabelAr,
    `${course.lessonCount} ${copy.catalog.lessonCount}`,
    formatDuration(course.totalSeconds),
  ].filter(Boolean);
  return `- [${course.title}](${url(`/courses/${course.slug}`)}) — ${facts.join(' · ')}`;
}

export function renderHomeMarkdown(courses: readonly CatalogCourse[]): string {
  const faq = [
    [copy.landing.faq1Q, copy.landing.faq1A],
    [copy.landing.faq2Q, copy.landing.faq2A],
    [copy.landing.faq3Q, copy.landing.faq3A],
    [copy.landing.faq4Q, copy.landing.faq4A],
    [copy.landing.faq6Q, copy.landing.faq6A],
    [copy.landing.faq7Q, copy.landing.faq7A],
  ]
    .map(([question, answer]) => `### ${question}\n\n${answer}`)
    .join('\n\n');

  return join([
    `# ${copy.site.platformName}`,
    `> ${copy.site.tagline}`,
    copy.seo.description,
    `## ${copy.landing.featuresTitle}`,
    join([
      `**${copy.landing.feature1Title}** — ${copy.landing.feature1Body}`,
      `**${copy.landing.feature2Title}** — ${copy.landing.feature2Body}`,
      `**${copy.landing.feature3Title}** — ${copy.landing.feature3Body}`,
    ]),
    `## ${copy.landing.tracksSelectTitle}`,
    [
      `- [${copy.landing.trackEssentialsTitle}](${url('/essentials')}) — ${copy.landing.trackEssentialsBody}`,
      `- [${copy.years.year1}](${url('/years/1')})`,
      `- [${copy.years.year2}](${url('/years/2')})`,
      `- [${copy.years.year3}](${url('/years/3')})`,
    ].join('\n'),
    `## ${copy.catalog.title}`,
    courses.length > 0
      ? courses.map(courseLine).join('\n')
      : `${copy.catalog.empty} — ${url('/courses')}`,
    `## ${copy.landing.instructorTitle}`,
    `**${copy.landing.instructorName}** — ${copy.landing.instructorBody}`,
    `[${copy.landing.aboutTitle}](${url('/about')})`,
    `## ${copy.agents.faqTitle}`,
    faq,
    footer('/'),
  ]);
}

export function renderAboutMarkdown(): string {
  const credits = copy.landing.aboutCredits
    .map((credit) => `### ${credit.label}\n\n${credit.marks.join(' · ')}\n\n${credit.note}`)
    .join('\n\n');

  return join([
    `# ${copy.landing.aboutPageTitle}`,
    `> ${copy.landing.aboutPageLead}`,
    copy.landing.aboutBody1,
    copy.landing.aboutBody2,
    copy.landing.aboutBody3,
    `**${copy.landing.aboutRole}**`,
    credits,
    `## ${copy.landing.aboutPageCoursesTitle}`,
    `[${copy.landing.aboutPageCta}](${url('/courses')})`,
    footer('/about'),
  ]);
}

export function renderCoursesMarkdown(courses: readonly CatalogCourse[]): string {
  return join([
    `# ${copy.catalog.title}`,
    `> ${copy.catalog.subtitle}`,
    courses.length > 0 ? courses.map(courseLine).join('\n') : copy.catalog.empty,
    footer('/courses'),
  ]);
}

/**
 * ⚠️ THE SAME LIST THE HTML PAGE RENDERS, foundation course included.
 *
 * `/years/1.md` is what an agent reads instead of `/years/1`, and the two
 * disagreeing is worse than either being wrong on its own: the page offers the
 * تأسيس course to a first-year student while the markdown tells the agent
 * asking on their behalf that the year is empty. See
 * `foundationCoursesOutsideYear` for why that course is on a year page it does
 * not belong to at all.
 */
export function renderYearMarkdown(year: 1 | 2 | 3, courses: readonly CatalogCourse[]): string {
  const listed = [
    ...foundationCoursesOutsideYear(courses, year),
    ...courses.filter((course) => course.year === year),
  ];
  return join([
    `# ${yearLabel(year)}`,
    `> ${copy.catalog.subtitle}`,
    listed.length > 0 ? listed.map(courseLine).join('\n') : copy.years.empty,
    footer(`/years/${year}`),
  ]);
}

export function renderEssentialsMarkdown(): string {
  const terms = ESSENTIAL_TERMS.map(
    (term) => `### ${term.ar} — ${term.en}\n\n${term.body}`,
  ).join('\n\n');

  return join([
    `# ${copy.essentials.title}`,
    `> ${copy.essentials.leadBefore} ${copy.essentials.leadCode} ${copy.essentials.leadAfter}`,
    `## ${copy.essentials.listTitle}`,
    copy.essentials.listLead,
    terms,
    footer('/essentials'),
  ]);
}

export function renderCourseMarkdown(course: CatalogCourseDetail): string {
  const outline = course.sections
    .map((section) => {
      const lessons = section.lessons
        .map((lesson) => {
          const duration =
            lesson.durationSeconds && lesson.durationSeconds > 0
              ? ` (${formatDuration(lesson.durationSeconds)})`
              : '';
          return `   - ${lesson.title}${duration}`;
        })
        .join('\n');
      return join([`### ${section.title}`, section.summary, lessons]);
    })
    .join('\n\n');

  return join([
    `# ${course.title}`,
    course.subtitle ? `> ${course.subtitle}` : null,
    courseMeta(course),
    course.description,
    course.sections.length > 0 ? `## ${copy.agents.courseOutline}` : null,
    course.sections.length > 0 ? outline : null,
    footer(`/courses/${course.slug}`),
  ]);
}

export function renderNewsIndexMarkdown(posts: readonly NewsListItem[]): string {
  const list = posts
    .map((post) => `- [${post.title}](${url(`/news/${post.slug}`)}) — ${post.excerpt}`)
    .join('\n');

  return join([
    `# ${copy.news.heading}`,
    `> ${copy.news.subtitle}`,
    posts.length > 0 ? list : copy.news.empty,
    footer('/news'),
  ]);
}

/**
 * ⚠️ The article body is passed through UNCHANGED — it is already markdown,
 * which is the one place in this file where no rendering is needed at all.
 *
 * It is deliberately NOT re-parsed and re-serialised: a round trip through
 * `lib/news/markdown.ts` would silently drop anything that parser does not
 * model (tables, nested lists, images), and an agent would receive a quietly
 * lossy copy of an article a human can read in full on the page.
 */
export function renderNewsPostMarkdown(post: NewsPostDetail): string {
  return join([
    `# ${post.title}`,
    `> ${post.excerpt}`,
    post.body,
    post.relatedCourseSlug && post.relatedCourseTitle
      ? `**${copy.news.relatedTitle}** [${post.relatedCourseTitle}](${url(`/courses/${post.relatedCourseSlug}`)})`
      : `[${copy.news.fallbackCta}](${url('/courses')})`,
    footer(`/news/${post.slug}`),
  ]);
}
