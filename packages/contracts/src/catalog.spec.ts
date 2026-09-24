import { describe, expect, it } from 'vitest';
import { CatalogCourseDetailSchema, CatalogCourseSchema, isComingSoon } from './catalog';

/**
 * `isComingSoon` is the ONE place that turns "how many real lectures does this
 * course have" into "is this the coming-soon state" — see its own doc comment
 * in `catalog.ts` for why the count itself is never recomputed here. The
 * predicate is intentionally this thin: `DashboardService`, `CourseProgressService`
 * and `CatalogService` already apply the real Prisma-level rule
 * (`isPublished && section.isPublished && kind != 'quiz'`, PR #232) to produce
 * `lessonCount`/`totalLessons`, and a fifth copy of that rule here would be
 * exactly the drift those files' own comments warn against.
 */
describe('isComingSoon', () => {
  it('is true at zero real lectures', () => {
    expect(isComingSoon({ lessonCount: 0, totalSeconds: 0 })).toBe(true);
  });

  it('is false the moment there is one real lecture', () => {
    expect(isComingSoon({ lessonCount: 1, totalSeconds: 600 })).toBe(false);
  });

  it('is false for a course with a full outline', () => {
    expect(isComingSoon({ lessonCount: 12, totalSeconds: 7200 })).toBe(false);
  });

  /**
   * ⚠️ `programming-cs-year1-2027-general` on production, 2026-09-15: one
   * `kind: 'text'` row titled «لسه اول محاضره هتنزل قريب جداً». The count says
   * one lesson and there is nothing to watch, so the «قريبًا» panel did not
   * render and the course published four purchasable Offers.
   */
  it('is true for a placeholder row with no playable duration', () => {
    expect(isComingSoon({ lessonCount: 1, totalSeconds: 0 })).toBe(true);
  });

  /**
   * ⚠️ The guard against the tempting wrong fix. `contentComplete` is the
   * instructor's manual flag and it is false on every live course, the
   * four-hour foundation one included — gating on it would mark the whole
   * catalogue "coming soon".
   */
  it('is false for a course still filling up that has real lectures', () => {
    expect(isComingSoon({ lessonCount: 3, totalSeconds: 11656 })).toBe(false);
  });
});

const baseCourse = () => ({
  contentComplete: false,
  id: crypto.randomUUID(),
  slug: 'programming-year-2',
  title: 'البرمجة وعلوم الحاسب',
  subtitle: null,
  systemSlug: 'thanaweya-3amma',
  systemNameAr: 'الثانوية العامة',
  year: 2,
  trackLabelAr: null,
  subjectNameAr: 'الحاسب الآلي',
  coverKey: null,
  lessonCount: 0,
  totalSeconds: 0,
  forGeneral: true,
  forLanguages: true,
  emphasis: null,
  emphasisNote: null,
  monthlyPriceCents: null,
  quarterlyPriceCents: null,
  yearlyPriceCents: null,
  bookTitle: null,
  bookPriceCents: null,
  publishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  description: null,
  sections: [],
  terms: [],
  // A course with no curriculum months — the normal state, and the one that
  // keeps the original rolling monthly subscription in service. See
  // `CatalogCourseDetailSchema.months`.
  months: [],
});

describe('CatalogCourseDetailSchema.comingSoonNote', () => {
  it('accepts null — the "no custom wording yet" state', () => {
    const parsed = CatalogCourseDetailSchema.parse({ ...baseCourse(), comingSoonNote: null });
    expect(parsed.comingSoonNote).toBeNull();
  });

  it('carries the admin-authored wording through unchanged', () => {
    const note = 'التسجيلات بتتصور دلوقتي، هتتنزل الأسبوع الجاي';
    const parsed = CatalogCourseDetailSchema.parse({ ...baseCourse(), comingSoonNote: note });
    expect(parsed.comingSoonNote).toBe(note);
  });

  it('rejects a payload missing the field outright', () => {
    const { comingSoonNote: _drop, ...rest } = { ...baseCourse(), comingSoonNote: null };
    expect(CatalogCourseDetailSchema.safeParse(rest).success).toBe(false);
  });
});

/**
 * `bookTitle`/`bookPriceCents` used to live ONLY on `CatalogCourseDetailSchema`
 * (via `.extend()`) — absent from `CatalogCourseSchema`, the shape the LIST
 * endpoint (`/api/catalog/courses`, `/library`, the dashboard's
 * `EnrolledCourseCard`) actually reads. `CatalogService.list()`'s own query
 * silently agreed, so a book-having course read book-less everywhere except
 * its own detail page. Guarded here at the schema level, and separately at
 * the service level in `catalog.service.spec.ts`.
 */
describe('CatalogCourseSchema.bookTitle/bookPriceCents', () => {
  const listRow = () => {
    const { description: _description, sections: _sections, terms: _terms, ...rest } = baseCourse();
    return rest;
  };

  it('accepts null — no book configured for this course', () => {
    const parsed = CatalogCourseSchema.parse(listRow());
    expect(parsed.bookTitle).toBeNull();
    expect(parsed.bookPriceCents).toBeNull();
  });

  it('carries a configured book through unchanged', () => {
    const parsed = CatalogCourseSchema.parse({
      ...listRow(),
      bookTitle: 'كتاب البرمجة',
      bookPriceCents: 25000,
    });
    expect(parsed.bookTitle).toBe('كتاب البرمجة');
    expect(parsed.bookPriceCents).toBe(25000);
  });

  it('rejects a payload missing the pair outright', () => {
    const { bookTitle: _bookTitle, bookPriceCents: _bookPriceCents, ...rest } = listRow();
    expect(CatalogCourseSchema.safeParse(rest).success).toBe(false);
  });
});

describe('CatalogCourseSchema.monthlyOnSale', () => {
  const base = {
    id: '019fc7d2-65d3-77bc-9352-8abe447f584c',
    slug: 'c',
    title: 'ك',
    subtitle: null,
    systemSlug: 'bacalorya',
    systemNameAr: 'ب',
    year: 2,
    trackLabelAr: null,
    subjectNameAr: 'م',
    coverKey: null,
    lessonCount: 1,
    totalSeconds: 60,
    forGeneral: true,
    forLanguages: true,
    emphasis: null,
    emphasisNote: null,
    comingSoonNote: null,
    contentComplete: false,
    monthlyPriceCents: 25000,
    quarterlyPriceCents: null,
    yearlyPriceCents: null,
    bookTitle: null,
    bookPriceCents: null,
    publishedAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  };

  it('reads a payload WITHOUT the field as on sale — an older API mid-deploy', () => {
    const parsed = CatalogCourseSchema.safeParse(base);
    expect(parsed.success && parsed.data.monthlyOnSale).toBe(true);
  });

  it('keeps an explicit false — a course sold by month with none open', () => {
    const parsed = CatalogCourseSchema.safeParse({ ...base, monthlyOnSale: false });
    expect(parsed.success && parsed.data.monthlyOnSale).toBe(false);
  });
});
