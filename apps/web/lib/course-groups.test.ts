import { describe, expect, it } from 'vitest';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import { courseCountLabel, groupBySubject } from './course-groups';

const course = (over: Partial<CatalogCourse>): CatalogCourse => ({
  id: '019fc7d2-65d3-77bc-9352-8abe447f584c',
  slug: 'programming-foundation-2027',
  title: 'الكورس التأسيسي لمادة البرمجة',
  subtitle: 'مسار الهندسة وعلوم الحاسب — دفعة 2027',
  systemSlug: 'bacalorya',
  systemNameAr: 'البكالوريا المصرية',
  year: 2,
  trackLabelAr: 'مسار الهندسة وعلوم الحاسب',
  subjectNameAr: 'البرمجة وعلوم الحاسب',
  coverKey: null,
  lessonCount: 3,
  totalSeconds: 3966,
  forGeneral: true,
  forLanguages: true,
  emphasis: null,
  emphasisNote: null,
  monthlyPriceCents: null,
  quarterlyPriceCents: null,
  yearlyPriceCents: null,
  publishedAt: '2026-08-03T13:31:23.446Z',
  updatedAt: '2026-08-13T22:25:08.862Z',
  ...over,
});

describe('groupBySubject', () => {
  it('is empty for an empty catalogue, so the page can decide to render nothing', () => {
    expect(groupBySubject([])).toEqual([]);
  });

  it('puts today’s single published course in one group named after its subject', () => {
    expect(groupBySubject([course({})])).toEqual([
      { subject: 'البرمجة وعلوم الحاسب', courses: [course({})] },
    ]);
  });

  it('collects every course of a subject under one heading', () => {
    const groups = groupBySubject([
      course({ slug: 'prog-1' }),
      course({ slug: 'db-1', subjectNameAr: 'قواعد البيانات' }),
      course({ slug: 'prog-2' }),
    ]);

    expect(groups.map((g) => g.subject)).toEqual(['البرمجة وعلوم الحاسب', 'قواعد البيانات']);
    expect(groups[0]?.courses.map((c) => c.slug)).toEqual(['prog-1', 'prog-2']);
    expect(groups[1]?.courses.map((c) => c.slug)).toEqual(['db-1']);
  });

  /**
   * The one that would fail silently. Sorting the groups by name reads as
   * tidier and reverses the curriculum: «قواعد البيانات» sorts before
   * «البرمجة» in Arabic, so a student would meet the second-term subject
   * first. The catalogue's own order is the curriculum's order — keep it.
   */
  it('keeps the catalogue’s order rather than sorting the headings', () => {
    const groups = groupBySubject([
      course({ slug: 'db-1', subjectNameAr: 'قواعد البيانات' }),
      course({ slug: 'prog-1', subjectNameAr: 'البرمجة وعلوم الحاسب' }),
    ]);

    expect(groups.map((g) => g.subject)).toEqual(['قواعد البيانات', 'البرمجة وعلوم الحاسب']);
  });

  /** Two courses of the same subject must not produce two identical headings. */
  it('does not repeat a heading when the same subject appears far apart', () => {
    const groups = groupBySubject([
      course({ slug: 'prog-1' }),
      course({ slug: 'db-1', subjectNameAr: 'قواعد البيانات' }),
      course({ slug: 'ai-1', subjectNameAr: 'الذكاء الاصطناعي' }),
      course({ slug: 'prog-2' }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]?.courses).toHaveLength(2);
  });
});

/**
 * The naive `${n} ${noun}` used for lesson counts elsewhere renders «1 كورس
 * واحد» and «2 كورسات» — wrong in three of the four Arabic forms. This is the
 * only place on the marketing surface where a count is set at reading size, so
 * it is the only place it shows.
 */
describe('courseCountLabel', () => {
  it('drops the numeral entirely for one and two', () => {
    expect(courseCountLabel(1)).toBe('كورس واحد');
    expect(courseCountLabel(2)).toBe('كورسين');
  });

  it('uses the 3–10 plural', () => {
    expect(courseCountLabel(3)).toBe('3 كورسات');
    expect(courseCountLabel(10)).toBe('10 كورسات');
  });

  it('goes back to the singular from eleven up', () => {
    expect(courseCountLabel(11)).toBe('11 كورس');
    expect(courseCountLabel(48)).toBe('48 كورس');
  });
});
