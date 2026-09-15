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

const ALL_RENDERERS: [name: string, render: () => string][] = [
  ['home', () => renderHomeMarkdown([course()])],
  ['about', () => renderAboutMarkdown()],
  ['courses', () => renderCoursesMarkdown([course()])],
  ['essentials', () => renderEssentialsMarkdown()],
  ['books', () => renderBooksMarkdown(bookCatalog())],
  ['year', () => renderYearMarkdown(1, [course()])],
  ['course', () => renderCourseMarkdown(detail())],
];

describe('every markdown document', () => {
  it('starts with a single h1', () => {
    for (const [name, render] of ALL_RENDERERS) {
      const lines = render().split('\n');
      expect(lines[0]?.startsWith('# '), name).toBe(true);
      expect(render().split('\n').filter((line) => line.startsWith('# ')).length, name).toBe(1);
    }
  });

  /**
   * The one an assistant will quote back to a parent. Without it, a summary of
   * a course outline reads exactly like a summary of the course.
   */
  it('states that lesson content needs an account', () => {
    for (const [name, render] of ALL_RENDERERS) {
      expect(render(), name).toContain(copy.agents.contentNote);
    }
  });

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

  /** A brand-new stack, or an API blip, gets the shipped questions rather than an empty heading. */
  it('falls back to the shipped seed when the block is missing or empty', () => {
    expect(renderHomeMarkdown([course()])).toContain(copy.landing.faq1Q);
    expect(renderHomeMarkdown([course()], [])).toContain(copy.landing.faq1Q);
  });
});

/**
 * An engine deciding whether to cite a page weighs its author and its
 * freshness. The HTML has shown both since the section shipped; the format an
 * assistant actually reads showed neither.
 */
describe('renderNewsPostMarkdown byline', () => {
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
