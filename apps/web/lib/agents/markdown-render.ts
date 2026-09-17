import { copy, formatCopy } from '@ayman/contracts';
import type {
  CatalogCourse,
  CatalogCourseDetail,
  NewsListItem,
  NewsPostDetail,
} from '@ayman/contracts';
// The SUBPATH — `books` is not on the root barrel, and the barrel is what
// stops the API booting when a runtime value comes through it.
import { minBookShippingCents, type BookCard, type BookCatalog } from '@ayman/contracts/books';
import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';
import { ESSENTIAL_TERMS } from '@/lib/essentials-terms';
import { foundationCoursesOutsideYear } from '@/lib/foundation-courses';
import { formatDuration } from '@/lib/format';
import { subscribeRails, subscribeSteps } from '@/lib/subscribe-steps';
import { coursePriceBadge, formatEGP } from '@/lib/price';
import { SITE_URL } from '@/lib/seo/jsonld';
import { yearAliasesAr, yearLabelAr } from '@/lib/year-label';

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
 * outline below lists lesson TITLES and stops there. Markdown that is easier to
 * scrape is not a licence to publish more.
 *
 * ⚠️ That paragraph used to end «…which the public course page already shows».
 * That was true when it was written and stopped being true on 2026-08-26, when
 * the course page began replacing the outline with `copy.course.lessonsLockedNote`
 * for PRICED courses. The titles are still published here, and the decision to
 * keep them is deliberate — recorded in `docs/runbooks/agent-discovery.md`:
 *
 *   · The allowlist is `CatalogService.findBySlug`, not the page. The same
 *     titles, plus lesson ids and durations, come back from
 *     `GET /api/catalog/courses/<slug>` — public, unauthenticated, documented
 *     in `/openapi.json` and linked from this document's own footer. Gating the
 *     twin would hide from a polite agent exactly what an impolite one reads
 *     from the API two lines below.
 *   · The page's gate is a UI decision, not a disclosure rule. Every outline
 *     row there is a `CourseEntry` — a button — so a priced course rendered a
 *     screen of controls that all led to the same subscribe error. See the note
 *     at that branch.
 *
 * ⚠️ If that ever becomes a disclosure rule, the fix is `findBySlug`'s
 * `sections.lessons.select` — the one source all three surfaces read — never
 * this file alone. Gating the twin by itself leaves three surfaces disagreeing,
 * which is strictly worse than either answer.
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
/**
 * ⚠️ `note` is a REQUIRED argument, with no default, and that is the point.
 *
 * This function used to append `copy.agents.contentNote` — «الدروس محتاجة حساب
 * طالب واشتراك» — to all nine twins unconditionally, which made every free
 * article and the book shop end by telling an assistant they were paywalled.
 * A default would hand the next twin whichever of the three sentences happens
 * to be wrong for it, silently, which is exactly how that shipped. Adding a
 * twin should not compile until somebody has decided what its content costs.
 */
function footer(canonicalPath: string, note: string): string {
  const a = copy.agents;
  return join([
    '---',
    `**${a.sourcePage}:** ${url(canonicalPath)}`,
    `**${a.agentIndex}:** ${url(AGENT_DISCOVERY_PATHS.llms)} · **${a.publicApi}:** ${url(AGENT_DISCOVERY_PATHS.serviceDesc)}`,
    note,
  ]);
}

/**
 * What the course costs, in the SAME words and the same order the course page
 * renders — monthly, quarterly, each open term, yearly — or «مفتوح مجانًا» when
 * nothing is priced.
 *
 * ⚠️ `copy.course.price*` and not a second set of strings. The markdown twin is
 * a rendering of the page, and a price line phrased differently here is a
 * second wording of the same fact that will drift the first time either is
 * edited. The terms only exist on the DETAIL read, which is why this takes the
 * detail type rather than `CatalogCourse`.
 */
function coursePrice(course: CatalogCourseDetail): string {
  const plans = [
    course.monthlyPriceCents !== null
      ? formatCopy(copy.course.priceMonthly, { price: formatEGP(course.monthlyPriceCents) })
      : null,
    course.quarterlyPriceCents !== null
      ? formatCopy(copy.course.priceQuarterly, { price: formatEGP(course.quarterlyPriceCents) })
      : null,
    ...course.terms.map((term) =>
      formatCopy(copy.course.priceTerm, { price: formatEGP(term.priceCents), term: term.title }),
    ),
    course.yearlyPriceCents !== null
      ? formatCopy(copy.course.priceYearly, { price: formatEGP(course.yearlyPriceCents) })
      : null,
  ].filter((plan): plan is string => plan !== null);

  return `- **${copy.agents.metaPrice}:** ${
    plans.length > 0 ? plans.join(' · ') : copy.course.freeBanner
  }`;
}

/** A definition list, one fact per line — `join` is for BLOCKS, not rows. */
function courseMeta(course: CatalogCourse): string {
  const a = copy.agents;
  const stream = streamLabel(course);
  return [
    `- **${a.metaYear}:** ${yearLabelAr(course.year)}`,
    `- **${a.metaSubject}:** ${course.subjectNameAr}`,
    course.trackLabelAr ? `- **${a.metaTrack}:** ${course.trackLabelAr}` : null,
    // «عربي» / «لغات» — see `streamLabel`. The HTML has shown this as a chip on
    // every card since the two editions split; no agent surface carried it.
    stream ? `- **${copy.stream.label}:** ${stream}` : null,
    `- **${a.metaSystem}:** ${course.systemNameAr}`,
    `- **${a.metaLessons}:** ${course.lessonCount} ${copy.catalog.lessonCount}`,
    `- **${copy.catalog.duration}:** ${formatDuration(course.totalSeconds)}`,
    // The machine-readable «قريبًا». See `isComingSoon`: a placeholder row
    // makes the lesson count 1 while there is still nothing to watch.
    course.totalSeconds === 0 ? `- **${copy.agents.metaContentPending}**` : null,
  ]
    .filter((row): row is string => row !== null)
    .join('\n');
}

/** One line per course — enough for an agent to choose, short enough to list 40. */
function courseLine(course: CatalogCourse, options: { omitYear?: boolean } = {}): string {
  const facts = [
    /*
     * ⚠️ The year is a fact about the COURSE and a lie about the ROW when the
     * row sits under a block whose lead says the course belongs to no year.
     * The foundation course is stored under year 2, so `/years/3.md` listed it
     * as «الصف الثاني بكالوريا» beneath an H1 reading «الصف الثالث بكالوريا».
     * `.filter(Boolean)` below drops it.
     */
    options.omitYear ? null : yearLabelAr(course.year),
    course.subjectNameAr,
    course.trackLabelAr,
    // The one word that tells «منهج البرمجة — تانية بكالوريا (عربي)» from the
    // لغات row beside it. An agent choosing between them could not see it.
    streamLabel(course),
    `${course.lessonCount} ${copy.catalog.lessonCount}`,
    formatDuration(course.totalSeconds),
    /*
     * ⚠️ LAST, and on every index document. The card has carried this badge all
     * along and none of the machine-readable indexes did, so the free
     * foundation course was rendered in exactly the same shape as the 150
     * ج/شهر ones — «الكورس بكام؟» and «فيه حاجة أجربها من غير فلوس؟»
     * unanswerable from `/courses.md`, `/years/*.md` or `/llms.txt`. One
     * function, `coursePriceBadge`, so the badge and these rows cannot drift.
     */
    coursePriceBadge(course),
    course.totalSeconds === 0 ? copy.agents.metaContentPending : null,
  ].filter(Boolean);
  return `- [${course.title}](${url(`/courses/${course.slug}`)}) — ${facts.join(' · ')}`;
}

/**
 * The landing FAQ as the PAGE renders it, and ONLY as the page renders it.
 *
 * ⚠️ There is deliberately no seeded fallback here, and the seed that was here
 * until 2026-09-15 was removed rather than never written. It looked prudent and
 * was wrong twice:
 *
 * · The outage case it claimed to cover cannot reach this function.
 *   `getHomeBlocks()` already falls back to `STARTER_HOME_BLOCKS` with every
 *   block `isPublished` — for an empty table AND for a caught API error — so
 *   the caller never has "no rows because the API blipped". It has "no rows"
 *   for exactly one reason.
 * · That reason is that the instructor TOOK THE SECTION DOWN. Republishing the
 *   shipped questions then contradicts the page, which is the whole defect this
 *   parameter was added to fix — and on another instructor's stack it publishes
 *   AYMAN's FAQ under their name.
 *
 * So no rows means no section, exactly as `(site)/page.tsx` drops the
 * `FAQPage` graph with the block it describes. The heading and the body are
 * emitted as ONE entry because `join` drops empty entries individually and
 * would otherwise leave a heading with nothing under it.
 *
 * `FaqPropsSchema.items` is `.min(1)`, so "published but empty" is not a state
 * that exists and there is no third case to handle.
 */
export function renderHomeMarkdown(
  courses: readonly CatalogCourse[],
  /** The rows the live `faq` block renders. None → the section is not published. */
  faqRows: ReadonlyArray<{ questionAr: string; answerAr: string }> = [],
): string {
  const faq =
    faqRows.length > 0
      ? join([
          `## ${copy.agents.faqTitle}`,
          faqRows.map((row) => `### ${row.questionAr}\n\n${row.answerAr}`).join('\n\n'),
        ])
      : null;

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
      ? courses.map((course) => courseLine(course)).join('\n')
      : `${copy.catalog.empty} — ${url('/courses')}`,
    `## ${copy.landing.instructorTitle}`,
    `**${copy.landing.instructorName}** — ${copy.landing.instructorBody}`,
    `[${copy.landing.aboutTitle}](${url('/about')})`,
    faq,
    footer('/', copy.agents.contentNote),
  ]);
}

export function renderAboutMarkdown(): string {
  /*
   * ⚠️ `mark.name`, not `mark`. `aboutCredits[].marks` used to be an array of
   * strings and became `{ id, name, short }` when the credits section grew its
   * logo chips; this line was not updated, and `Array.prototype.join` on
   * objects does not throw — it calls `toString`. So `/about.md` published four
   * headings reading «[object Object] · [object Object] · [object Object]»,
   * live and uncaught, in the one document written specifically for the
   * assistants this section exists to convince. Measured on production
   * 2026-09-15: four occurrences.
   *
   * Nothing in CI could see it: the twin's own test asserted on `copy.landing`
   * strings that this line never touched, and `[object Object]` is a valid
   * string. The test below now names the literal.
   */
  const credits = copy.landing.aboutCredits
    .map(
      (credit) =>
        `### ${credit.label}\n\n${credit.marks.map((mark) => mark.name).join(' · ')}\n\n${credit.note}`,
    )
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
    footer('/about', copy.agents.openNote),
  ]);
}

export function renderCoursesMarkdown(courses: readonly CatalogCourse[]): string {
  return join([
    `# ${copy.catalog.title}`,
    `> ${copy.catalog.subtitle}`,
    courses.length > 0 ? courses.map((course) => courseLine(course)).join('\n') : copy.catalog.empty,
    footer('/courses', copy.agents.contentNote),
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
  const foundation = foundationCoursesOutsideYear(courses, year);
  const forYear = courses.filter((course) => course.year === year);
  return join([
    `# ${yearLabelAr(year)}`,
    `> ${copy.catalog.subtitle}`,
    /*
     * ⚠️ The year's other spellings, digits included, right under the heading.
     *
     * This is the document an assistant fetches instead of the HTML, and the
     * HTML's `alternateName` does not survive the conversion — so without this
     * line the markdown twin of `/years/2` contains the string «الصف الثاني
     * بكالوريا» and nothing a question phrased «٢ بكالوريا» or «2 بكالوريا»
     * could match. See `yearAliasesAr` for why both digit sets ship.
     */
    `${copy.llms.alsoWritten} ${yearAliasesAr(year)
      .slice(1)
      .map((alias) => `«${alias}»`)
      .join('، ')}.`,
    /*
     * The shared foundation course, under its own heading and WITHOUT a year
     * fact — the same shape the HTML gives it, which is a separate section with
     * its own lead rather than one more row in the year's list. `##`, not `#`:
     * a document has exactly one h1 and the test asserts it.
     */
    foundation.length > 0 ? `## ${copy.years.foundationTitle}` : null,
    foundation.length > 0 ? copy.years.foundationLead : null,
    foundation.length > 0
      ? foundation.map((course) => courseLine(course, { omitYear: true })).join('\n')
      : null,
    forYear.length > 0 ? forYear.map((course) => courseLine(course)).join('\n') : null,
    /*
     * Three states, not two. A year with only the shared course is NOT empty —
     * it has something to offer — and it is not stocked either, and saying
     * neither is what made `/years/3.md` read as a year-2 listing.
     */
    forYear.length === 0
      ? foundation.length > 0
        ? copy.years.foundationOnlyNote
        : copy.years.empty
      : null,
    footer(`/years/${year}`, copy.agents.contentNote),
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
    footer('/essentials', copy.agents.openNote),
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
    // ROWS of one definition list, so `\n` — `join` above is for blocks.
    `${courseMeta(course)}\n${coursePrice(course)}`,
    course.description,
    course.sections.length > 0 ? `## ${copy.agents.courseOutline}` : null,
    course.sections.length > 0 ? outline : null,
    footer(`/courses/${course.slug}`, copy.agents.contentNote),
  ]);
}

/**
 * «عام» / «لغات» / «عام ولغات» — the primary disambiguator for a Bakalorya
 * student, and the one fact that decides which of two identically-titled
 * products is theirs.
 *
 * ⚠️ It appeared on NO agent surface. The HTML renders it as a `<StreamBadge>`
 * chip on every course and book card; `/llms.txt`, every markdown twin and the
 * course JSON-LD all omitted it, so an assistant recommending «كتاب تانية
 * بكالوريا برمجة» had two rows differing in one word it could not see. Same
 * strings as the chip — `copy.stream` — so the two cannot describe one product
 * differently.
 */
function streamLabel(item: { forGeneral: boolean; forLanguages: boolean }): string | null {
  if (item.forGeneral && item.forLanguages) return copy.stream.both;
  if (item.forGeneral) return copy.stream.general;
  if (item.forLanguages) return copy.stream.languages;
  // The database CHECK makes "neither" unrepresentable; a stale payload from
  // before that migration says nothing rather than saying something wrong.
  return null;
}

/**
 * «قسم الكتب» as markdown.
 *
 * ## Why this document had to exist
 *
 * `/books` is the only page on the site that states a price a stranger can act
 * on, and it was absent from EVERY agent channel at once: no markdown twin, no
 * line in `/llms.txt`, no entry in the ARD manifest, no structured data beyond
 * a breadcrumb. So «كتاب أيمن أبو العلا بكام؟» — a question with a definite
 * published answer — was one an assistant had to decline or guess.
 *
 * ⚠️ The prices here come from the same `getBookCatalogOrEmpty` payload the
 * shelves render from, and the shipping line uses the same `copy.books`
 * template the page prints. There is no second source and there must not be
 * one: a markdown twin quoting a stale price is worse than a twin that quotes
 * none, because the reader acts on it.
 *
 * ⚠️ `inStock` is stated per title. A book the shop shows but cannot sell is
 * still on the page — see `BookCardSchema.inStock` — and an agent that reads
 * only the price would recommend ordering it.
 */
function bookLine(book: BookCard): string {
  const b = copy.books;
  const facts = [
    // `bookOrder.priceLine` («{price} جنيه»), not a bare `formatEGP`. On the
    // card the layout says what the number is; in a `·`-joined markdown row
    // «250 · الصف 2 · عربي» is three numbers and no unit.
    formatCopy(copy.bookOrder.priceLine, { price: formatEGP(book.priceCents) }),
    book.year !== null ? formatCopy(b.yearChip, { n: String(book.year) }) : null,
    book.pageCount !== null ? formatCopy(b.pages, { n: String(book.pageCount) }) : null,
    streamLabel(book),
    book.inStock ? null : b.outOfStock,
  ].filter((fact): fact is string => Boolean(fact));

  return `- **${book.titleAr}** — ${facts.join(' · ')}${
    book.subtitleAr ? `\n   ${book.subtitleAr}` : ''
  }`;
}

export function renderBooksMarkdown(catalog: BookCatalog): string {
  const b = copy.books;
  const shelves = catalog.shelves
    .map((shelf: BookCatalog['shelves'][number]) => {
      const terms = [
        [b.termFirst, shelf.first],
        [b.termSecond, shelf.second],
        [b.termFull, shelf.full],
      ] as const;
      const body = terms
        .filter(([, books]) => books.length > 0)
        .map(([label, books]) => `### ${label}\n\n${books.map(bookLine).join('\n')}`)
        .join('\n\n');
      return join([`## ${shelf.subjectNameAr}`, body]);
    })
    .join('\n\n');

  return join([
    `# ${b.metaTitle}`,
    `> ${b.metaDescription}`,
    b.lead,
    /*
     * The delivery fee, stated once, exactly as the shelf states it. A book
     * price with no delivery fee beside it is a number an agent will quote as
     * the total.
     *
     * ⚠️ Delivery is ZONED now, so the floor alone is not enough here. An agent
     * reading «الشحن ٨٠ ج» will repeat it to somebody in أسوان as if it were
     * the price — this is the one surface whose output is quoted verbatim by a
     * third party we cannot correct afterwards. `shippingOnce` says «من … على
     * حسب المحافظة» and the line under it names all three zones.
     */
    ...(catalog.shippingRates.cairo_giza > 0 ||
    catalog.shippingRates.delta > 0 ||
    catalog.shippingRates.far > 0
      ? [
          formatCopy(b.shippingOnce, {
            price: formatEGP(minBookShippingCents(catalog.shippingRates)),
          }),
          formatCopy(b.shippingZones, {
            near: formatEGP(catalog.shippingRates.cairo_giza),
            delta: formatEGP(catalog.shippingRates.delta),
            far: formatEGP(catalog.shippingRates.far),
          }),
        ]
      : // `shippingFreeOnce`, not `shippingFree` — the latter is the VALUE in a
        // price breakdown («مجانًا»), not a sentence.
        [b.shippingFreeOnce]),
    catalog.total > 0 ? shelves : b.empty,
    footer('/books', copy.agents.booksNote),
  ]);
}

/**
 * «إزاي أشترك؟» as markdown.
 *
 * ⚠️ The steps and the rails come from `lib/subscribe-steps.ts`, the same
 * module the HTML page and its `FAQPage` graph read. Three surfaces describing
 * one flow from three hand-written copies is how «[object Object]» reached
 * `/about.md` and how every free article twin ended up claiming it was
 * paywalled.
 *
 * ⚠️ The destination number is NOT here, deliberately, and the step that would
 * carry it says why in its own body — see the note on `copy.subscribePage`. A
 * markdown document travels further than the page: it gets pasted, quoted and
 * cached, which makes it the worst possible place to publish a wallet number.
 */
export function renderSubscribeMarkdown(contact: {
  instapay?: string | null;
  vodafoneCash?: string | null;
}): string {
  const c = copy.subscribePage;
  const rails = subscribeRails(contact);

  return join([
    `# ${c.title}`,
    `> ${c.metaDescription}`,
    c.lead,
    subscribeSteps()
      .map((step, index) => `${index + 1}. **${step.title}** — ${step.body}`)
      .join('\n'),
    `## ${c.railsTitle}`,
    rails.length > 0 ? rails.map((rail) => `- ${rail}`).join('\n') : c.railsNone,
    c.booksNote,
    footer('/subscribe', copy.agents.openNote),
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
    footer('/news', copy.agents.openNote),
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
    /*
     * The byline and the dates — who wrote this and when it last moved.
     *
     * ⚠️ The HTML page has shown both since the section shipped; the markdown
     * twin, which is the format an assistant actually reads, showed neither. An
     * engine weighing whether to cite a page weighs its author and its
     * freshness, and a document with no date reads as a document of unknown
     * age — the worst of the three states it could be in.
     *
     * ISO, not the Arabic rendering `formatArticleDate` produces for the page.
     * This line is read by a machine; «١٣ سبتمبر ٢٠٢٦» is a string it has to
     * guess a calendar for, and `2026-09-13` is not.
     *
     * `dateModified` only when it actually differs — restating the publish date
     * under a second label tells a reader the article was edited on the day it
     * went out, which is a fact about nothing.
     */
    [
      `**${copy.agents.metaAuthor}:** ${copy.site.instructor}`,
      `**${copy.news.published}:** ${post.publishedAt.slice(0, 10)}`,
      post.updatedAt.slice(0, 10) !== post.publishedAt.slice(0, 10)
        ? `**${copy.agents.metaUpdated}:** ${post.updatedAt.slice(0, 10)}`
        : null,
    ]
      .filter((row): row is string => row !== null)
      .join('  \n'),
    post.body,
    post.relatedCourseSlug && post.relatedCourseTitle
      ? `**${copy.news.relatedTitle}** [${post.relatedCourseTitle}](${url(`/courses/${post.relatedCourseSlug}`)})`
      : `[${copy.news.fallbackCta}](${url('/courses')})`,
    footer(`/news/${post.slug}`, copy.agents.openNote),
  ]);
}
