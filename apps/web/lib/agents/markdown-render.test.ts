import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import type { CatalogCourse, CatalogCourseDetail } from '@ayman/contracts';
import type { BookCatalog } from '@ayman/contracts/books';
import {
  renderAboutMarkdown,
  renderBooksMarkdown,
  renderCourseMarkdown,
  renderCoursesMarkdown,
  renderEssentialsMarkdown,
  renderHomeMarkdown,
  renderNewsIndexMarkdown,
  renderNewsPostMarkdown,
  renderYearMarkdown,
} from './markdown-render';

const course = (overrides: Partial<CatalogCourse> = {}): CatalogCourse =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'python-basics',
    title: 'أساسيات بايثون',
    subtitle: null,
    systemSlug: 'bacalorya',
    systemNameAr: 'البكالوريا المصرية',
    year: 1,
    trackLabelAr: null,
    subjectNameAr: 'علوم الحاسب',
    coverKey: null,
    lessonCount: 12,
    totalSeconds: 3600,
    monthlyPriceCents: 15000,
    quarterlyPriceCents: null,
    yearlyPriceCents: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as CatalogCourse;

const detail = (overrides: Partial<CatalogCourseDetail> = {}): CatalogCourseDetail =>
  ({
    ...course(),
    description: 'وصف الكورس',
    terms: [],
    sections: [
      {
        id: '00000000-0000-4000-8000-0000000000s1',
        title: 'القسم الأول',
        summary: 'ملخص القسم',
        lessons: [
          {
            id: '00000000-0000-4000-8000-0000000000l1',
            title: 'الدرس الأول',
            kind: 'video',
            estimatedSeconds: 300,
            isFreePreview: true,
            durationSeconds: 300,
          },
        ],
      },
    ],
    ...overrides,
  }) as CatalogCourseDetail;

const post = (overrides = {}) => ({
  id: '00000000-0000-4000-8000-0000000000n1',
  slug: 'مقال',
  title: 'عنوان',
  excerpt: 'وصف',
  body: 'نص',
  coverKey: null,
  publishedAt: '2026-09-13T16:10:33.148Z',
  updatedAt: '2026-09-13T16:10:33.149Z',
  readingMinutes: 3,
  relatedCourseSlug: null,
  relatedCourseTitle: null,
  ...overrides,
});

/** Course-catalog documents: the lessons behind them really are gated. */
const GATED_RENDERERS: [name: string, render: () => string][] = [
  ['home', () => renderHomeMarkdown([course()])],
  ['courses', () => renderCoursesMarkdown([course()])],
  ['year', () => renderYearMarkdown(1, [course()])],
  ['course', () => renderCourseMarkdown(detail())],
];

/**
 * Documents whose whole body is free to read with no account — the thirty-two
 * articles above all. Every one of these used to end by telling an assistant
 * it was behind a subscription.
 */
const OPEN_RENDERERS: [name: string, render: () => string][] = [
  ['about', () => renderAboutMarkdown()],
  ['essentials', () => renderEssentialsMarkdown()],
  ['news', () => renderNewsIndexMarkdown([])],
  ['article', () => renderNewsPostMarkdown(post() as never)],
];

const BOOKS_RENDERERS: [name: string, render: () => string][] = [
  ['books', () => renderBooksMarkdown(bookCatalog())],
];

const ALL_RENDERERS: [name: string, render: () => string][] = [
  ...GATED_RENDERERS,
  ...OPEN_RENDERERS,
  ...BOOKS_RENDERERS,
];

/**
 * ⚠️ The falsehood this table exists to stop, and the mirror of the one
 * `courseJsonLd` had: there a PAID course was published as free; here every
 * FREE page was published as gated. `footer()` appended one note to all nine
 * twins, so the thirty-two articles — the only long-form free teaching corpus
 * on the site — and `/books.md`, whose checkout is `@Public()` and needs no
 * account at all, both ended by telling an assistant the content was paid.
 */
describe('what each twin says the content costs', () => {
  it.each(GATED_RENDERERS)('%s says the lessons need a subscription', (_name, render) => {
    expect(render()).toContain(copy.agents.contentNote);
  });

  it.each(OPEN_RENDERERS)('%s says it is open to read', (_name, render) => {
    const markdown = render();
    expect(markdown).toContain(copy.agents.openNote);
    expect(markdown).not.toContain(copy.agents.contentNote);
  });

  /** Ordering a printed book is `@Public()` — no account, no subscription. */
  it.each(BOOKS_RENDERERS)('%s does not invent a sign-up wall', (_name, render) => {
    const markdown = render();
    expect(markdown).toContain(copy.agents.booksNote);
    expect(markdown).not.toContain(copy.agents.contentNote);
  });

  /** A new twin cannot ship without one, which is what the required argument buys. */
  it.each(ALL_RENDERERS)('%s carries exactly one of the three notes', (_name, render) => {
    const markdown = render();
    const notes = [copy.agents.contentNote, copy.agents.openNote, copy.agents.booksNote];
    expect(notes.filter((note) => markdown.includes(note))).toHaveLength(1);
  });
});

describe('every markdown document', () => {
  it('starts with a single h1', () => {
    for (const [name, render] of ALL_RENDERERS) {
      const lines = render().split('\n');
      expect(lines[0]?.startsWith('# '), name).toBe(true);
      expect(render().split('\n').filter((line) => line.startsWith('# ')).length, name).toBe(1);
    }
  });

  /*
   * ⚠️ This used to assert `contentNote` on EVERY renderer, and that assertion
   * is what locked the falsehood in: it made «الدروس محتاجة اشتراك» a
   * requirement of the free article twins and of the book shop. The rule it was
   * protecting is real — a summary of a course outline must not read like a
   * summary of the course — but it is a rule about the CATALOG documents, and
   * it now lives in «what each twin says the content costs» above, per table.
   */

  it('links back to the canonical page it mirrors', () => {
    for (const [name, render] of ALL_RENDERERS) {
      expect(render(), name).toContain(copy.agents.sourcePage);
    }
  });

  it('never leaves a stray empty block from an absent optional field', () => {
    for (const [name, render] of ALL_RENDERERS) {
      expect(render(), name).not.toMatch(/\n{3,}/);
    }
  });
});

/**
 * ⚠️ The literal, named. `[object Object]` is a valid string, so nothing —
 * not the type checker, not a snapshot of `copy.landing` strings — could see
 * that `/about.md` had been serving four headings of it since `marks` became
 * objects. The only test that catches this is one that says the words.
 */
const bookCatalog = (overrides: Partial<BookCatalog> = {}): BookCatalog => ({
  shippingCents: 6500,
  total: 1,
  shelves: [
    {
      subjectId: '00000000-0000-4000-8000-0000000000b1',
      subjectNameAr: 'البرمجة وعلوم الحاسب',
      subjectSlug: 'programming_cs',
      first: [
        {
          id: '00000000-0000-4000-8000-0000000000b2',
          slug: 'y2-general',
          titleAr: 'كتاب تانية بكالوريا برمجة عربي',
          subtitleAr: null,
          coverKey: null,
          descriptionAr: null,
          priceCents: 25000,
          comparePriceCents: null,
          pageCount: 180,
          term: 'first' as const,
          year: 2,
          inStock: true,
          forGeneral: true,
          forLanguages: false,
          showOnLanding: true,
        },
      ],
      second: [],
      full: [],
    },
  ],
  ...overrides,
});

/**
 * ⚠️ `/books` renders its shelves from a CLIENT component — `books-shop.tsx`'s
 * own note records that `curl /books` returns zero rendered cards. This twin is
 * one of the only two server-rendered descriptions of the shop that exist.
 */
/**
 * ⚠️ The homepage FAQ is a `home_blocks` row an admin edits; `copy.landing.faq*`
 * is only its starting value. Measured on production 2026-09-15: the page
 * rendered seven questions in one order and `/index.md` published six from the
 * seed, so the two surfaces answered different questions.
 */
describe('renderHomeMarkdown FAQ', () => {
  it('publishes the rows the live block renders', () => {
    const markdown = renderHomeMarkdown(
      [course()],
      [{ questionAr: 'لو حصلت مشكلة في حسابي؟', answerAr: 'كلّمنا على واتساب.' }],
    );

    expect(markdown).toContain('لو حصلت مشكلة في حسابي؟');
    expect(markdown).toContain('كلّمنا على واتساب.');
    // The seeded question is NOT published beside it — the block replaced it.
    expect(markdown).not.toContain(copy.landing.faq1Q);
  });

  /**
   * ⚠️ This case used to assert the opposite, and asserting it was the defect.
   * `getHomeBlocks()` already falls back to `STARTER_HOME_BLOCKS` with every
   * block published — for an empty table and for a caught API error alike — so
   * "no rows" reaching this function means exactly one thing: the instructor
   * took the section down. Republishing the shipped questions then contradicts
   * the page, and on another instructor's stack publishes Ayman's FAQ under
   * their name.
   */
  it('omits the whole section when no block is published', () => {
    const markdown = renderHomeMarkdown([course()]);

    expect(markdown).not.toContain(copy.agents.faqTitle);
    expect(markdown).not.toContain(copy.landing.faq1Q);
    expect(markdown).not.toContain(copy.landing.faq4Q);
    // No dangling heading: the document still ends where it should.
    expect(markdown).toContain(copy.agents.contentNote);
  });
});

/**
 * An engine deciding whether to cite a page weighs its author and its
 * freshness. The HTML has shown both since the section shipped; the format an
 * assistant actually reads showed neither.
 */
describe('renderNewsPostMarkdown byline', () => {
  it('names the author and the publish date in ISO', () => {
    const markdown = renderNewsPostMarkdown(post() as never);

    expect(markdown).toContain(`**${copy.agents.metaAuthor}:** ${copy.site.instructor}`);
    // ISO, not «١٣ سبتمبر ٢٠٢٦»: this line is read by a machine.
    expect(markdown).toContain('2026-09-13');
  });

  /** Restating the publish date under a second label is a fact about nothing. */
  it('adds the modified date only when it differs from the publish date', () => {
    expect(renderNewsPostMarkdown(post() as never)).not.toContain(copy.agents.metaUpdated);
    expect(
      renderNewsPostMarkdown(post({ updatedAt: '2026-09-20T00:00:00.000Z' }) as never),
    ).toContain(`**${copy.agents.metaUpdated}:** 2026-09-20`);
  });
});

/**
 * ⚠️ `/years/3.md` was headed «الصف الثالث بكالوريا» with a single row reading
 * «الصف الثاني بكالوريا» — `courseLine` leads with the COURSE's year and the
 * shared foundation course is stored under year 2, so the document contradicted
 * its own title. The HTML says this by being visibly empty under the foundation
 * section; markdown has no empty space and has to say it in words.
 */
describe('renderYearMarkdown and the shared foundation course', () => {
  const foundation = course({
    slug: 'programming-foundation-2027',
    title: 'الكورس التأسيسي لمادة البرمجة',
    year: 2,
    monthlyPriceCents: null,
    quarterlyPriceCents: null,
    yearlyPriceCents: null,
  });

  it('does not stamp another year on the foundation row', () => {
    const markdown = renderYearMarkdown(3, [foundation]);

    expect(markdown.split('\n')[0]).toContain(copy.years.year3);
    expect(markdown).toContain(copy.years.foundationTitle);
    // The lie: the row used to carry «الصف الثاني بكالوريا» under that H1.
    expect(markdown).not.toContain(copy.years.year2);
  });

  it('says the year has nothing of its own rather than calling it empty', () => {
    const markdown = renderYearMarkdown(3, [foundation]);

    expect(markdown).toContain(copy.years.foundationOnlyNote);
    expect(markdown).not.toContain(copy.years.empty);
  });

  it('keeps the year fact on the year own courses', () => {
    const markdown = renderYearMarkdown(2, [course({ year: 2 })]);

    expect(markdown).toContain(copy.years.year2);
    expect(markdown).not.toContain(copy.years.foundationOnlyNote);
  });

  /** A year with neither is genuinely empty and still says so. */
  it('still reports a year with nothing at all', () => {
    expect(renderYearMarkdown(3, [])).toContain(copy.years.empty);
  });
});

/**
 * «الكورس بكام؟» from an index document. The card has carried this badge all
 * along and no machine-readable index did, so the free foundation course was
 * rendered in exactly the same shape as the paid ones.
 */
describe('the price on the index documents', () => {
  it('tells the free course from the paid ones in a listing', () => {
    const markdown = renderCoursesMarkdown([
      course({ slug: 'paid' }),
      course({
        slug: 'free',
        monthlyPriceCents: null,
        quarterlyPriceCents: null,
        yearlyPriceCents: null,
      }),
    ]);

    expect(markdown).toContain('150');
    expect(markdown).toContain(copy.landing.courseFree);
  });
});

describe('renderBooksMarkdown', () => {
  it('quotes the price, the stream and the delivery fee', () => {
    const markdown = renderBooksMarkdown(bookCatalog());

    expect(markdown).toContain('كتاب تانية بكالوريا برمجة عربي');
    expect(markdown).toContain('250');
    // «عربي» — the one word that separates two identically-titled books.
    expect(markdown).toContain(copy.stream.general);
    // The fee is stated once, on the shelf, because a book price with no
    // delivery fee beside it is a number an agent quotes as the total.
    expect(markdown).toContain('65');
  });

  it('says a withdrawn title cannot be bought', () => {
    const catalog = bookCatalog();
    // `noUncheckedIndexedAccess` is on — assert the fixture's own shape rather
    // than asserting past it with a `!`.
    const shelf = catalog.shelves[0];
    const first = shelf?.first[0];
    expect(first).toBeDefined();
    if (!shelf || !first) throw new Error('fixture lost its shelf');

    const withdrawn: BookCatalog = {
      ...catalog,
      shelves: [{ ...shelf, first: [{ ...first, inStock: false }] }],
    };

    expect(renderBooksMarkdown(withdrawn)).toContain(copy.books.outOfStock);
  });

  it('renders the empty shop rather than an empty heading', () => {
    const markdown = renderBooksMarkdown({ shelves: [], shippingCents: 6500, total: 0 });
    expect(markdown).toContain(copy.books.empty);
  });
});

describe('every markdown twin', () => {
  it.each(ALL_RENDERERS)('%s renders no stringified object', (_name, render) => {
    expect(render()).not.toContain('[object Object]');
  });
});

describe('renderAboutMarkdown', () => {
  it('names the institutions behind the credits', () => {
    const markdown = renderAboutMarkdown();

    for (const credit of copy.landing.aboutCredits) {
      for (const mark of credit.marks) expect(markdown).toContain(mark.name);
    }
  });
});

describe('renderCourseMarkdown', () => {
  it('renders the outline down to lesson titles', () => {
    const markdown = renderCourseMarkdown(detail());

    expect(markdown).toContain('القسم الأول');
    expect(markdown).toContain('الدرس الأول');
    expect(markdown).toContain(copy.agents.courseOutline);
  });

  /**
   * The contract boundary, asserted rather than trusted. `CatalogCourseDetail`
   * carries no `videoExternalId` by design — but it DOES carry `isFreePreview`
   * and lesson ids, and neither belongs in a document written for scraping.
   * A lesson id is the input to `/api/lessons/:id/player`; publishing a list of
   * them is publishing the attack surface, even though that route needs a
   * session and an enrolment.
   */
  it('publishes no lesson ids and no free-preview flags', () => {
    const markdown = renderCourseMarkdown(detail());

    expect(markdown).not.toContain('0000000000l1');
    expect(markdown).not.toContain('isFreePreview');
    expect(markdown).not.toContain('freePreview');
    expect(markdown).not.toContain(copy.catalog.freePreview);
  });

  /**
   * «الكورس بكام؟». The visible page has always carried the price block; the
   * markdown twin — the document an assistant actually reads — did not, so the
   * one document written for machines was the only one that could not answer
   * the question.
   */
  it('quotes every plan the course sells, in the page order', () => {
    const markdown = renderCourseMarkdown(
      detail({
        monthlyPriceCents: 15000,
        quarterlyPriceCents: 30000,
        yearlyPriceCents: 95000,
        terms: [{ id: '00000000-0000-4000-8000-0000000000t1', title: 'الترم الأول', priceCents: 45000 }],
      }),
    );
    const line = markdown.split('\n').find((row) => row.includes(copy.agents.metaPrice));

    expect(line).toBeDefined();
    // The order is the page's: monthly, quarterly, term, yearly.
    expect(line).toMatch(/150.+300.+الترم الأول.+950/u);
  });

  it('says the free course is free rather than leaving the row out', () => {
    const markdown = renderCourseMarkdown(
      detail({ monthlyPriceCents: null, quarterlyPriceCents: null, yearlyPriceCents: null, terms: [] }),
    );

    expect(markdown).toContain(`**${copy.agents.metaPrice}:** ${copy.course.freeBanner}`);
  });

  it('names the stream, the one word that tells the two editions apart', () => {
    const general = renderCourseMarkdown(detail({ forGeneral: true, forLanguages: false }));
    const languages = renderCourseMarkdown(detail({ forGeneral: false, forLanguages: true }));

    expect(general).toContain(`**${copy.stream.label}:** ${copy.stream.general}`);
    expect(languages).toContain(`**${copy.stream.label}:** ${copy.stream.languages}`);
  });

  it('omits the outline heading entirely for a course with no sections', () => {
    const markdown = renderCourseMarkdown(detail({ sections: [] }));

    expect(markdown).not.toContain(copy.agents.courseOutline);
    expect(markdown).toContain('أساسيات بايثون');
  });

  it('drops the track row when a course has no track', () => {
    expect(renderCourseMarkdown(detail())).not.toContain(copy.agents.metaTrack);
    expect(renderCourseMarkdown(detail({ trackLabelAr: 'تطبيقات الموبايل' }))).toContain(
      copy.agents.metaTrack,
    );
  });
});

describe('renderYearMarkdown', () => {
  it('lists only that year and says so when empty', () => {
    const courses = [course({ year: 1 }), course({ slug: 'y2', year: 2, title: 'كورس تاني' })];

    expect(renderYearMarkdown(1, courses)).toContain('أساسيات بايثون');
    expect(renderYearMarkdown(1, courses)).not.toContain('كورس تاني');
    expect(renderYearMarkdown(3, courses)).toContain(copy.years.empty);
  });

  /* The markdown twin and the HTML page have to list the same courses — an
     agent reading `/years/1.md` on a student's behalf must not be told the
     year is empty while the page is offering them a course. */
  it('carries the foundation course onto a year that does not own it', () => {
    const courses = [course({ slug: 'found', year: 2, title: 'الكورس التأسيسي' })];

    expect(renderYearMarkdown(1, courses)).toContain('الكورس التأسيسي');
    expect(renderYearMarkdown(1, courses)).not.toContain(copy.years.empty);
  });

  it('does not list it twice on its own year', () => {
    const md = renderYearMarkdown(2, [course({ slug: 'found', year: 2, title: 'الكورس التأسيسي' })]);

    expect(md.match(/\/courses\/found/g)).toHaveLength(1);
  });
});

describe('renderCoursesMarkdown', () => {
  it('links every course at its real URL', () => {
    expect(renderCoursesMarkdown([course()])).toContain('/courses/python-basics');
  });

  it('says so rather than rendering an empty list', () => {
    expect(renderCoursesMarkdown([])).toContain(copy.catalog.empty);
  });
});
