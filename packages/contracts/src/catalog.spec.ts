import { describe, expect, it } from 'vitest';
import { CatalogCourseDetailSchema, isComingSoon } from './catalog';

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
    expect(isComingSoon(0)).toBe(true);
  });

  it('is false the moment there is one real lecture', () => {
    expect(isComingSoon(1)).toBe(false);
  });

  it('is false for a course with a full outline', () => {
    expect(isComingSoon(12)).toBe(false);
  });
});

const baseCourse = () => ({
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
  publishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  description: null,
  sections: [],
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
