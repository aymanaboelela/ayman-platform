import { describe, expect, it } from 'vitest';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import { foundationCourses } from './foundation-courses';

/**
 * `/essentials` puts the published foundation course above the twelve terms.
 * Nothing on the catalog contract says «this is the beginner's course», so the
 * selection is a match on the course's own name — which makes it exactly the
 * kind of rule that needs a test: it fails SILENTLY in both directions. Too
 * loose and the marketing page advertises a curriculum course as the place to
 * start; too tight and the section quietly disappears from the page the
 * landing's «التأسيس» card points at.
 */
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
  publishedAt: '2026-08-03T13:31:23.446Z',
  updatedAt: '2026-08-13T22:25:08.862Z',
  ...over,
});

describe('foundationCourses', () => {
  it('picks the course published on production', () => {
    expect(foundationCourses([course({})]).map((c) => c.slug)).toEqual([
      'programming-foundation-2027',
    ]);
  });

  it('matches on the subtitle as well, for a title that carries only the year', () => {
    const found = foundationCourses([
      course({ slug: 'y2', title: 'برمجة ٢٠٢٧', subtitle: 'المرحلة التأسيسية' }),
    ]);
    expect(found).toHaveLength(1);
  });

  it('leaves curriculum courses alone', () => {
    const found = foundationCourses([
      course({ slug: 'a', title: 'أساسيات البرمجة بلغة بايثون', subtitle: null }),
      course({ slug: 'b', title: 'مراجعة نهائية — البرمجة', subtitle: 'قبل الامتحان' }),
    ]);
    expect(found).toEqual([]);
  });

  /* The section renders nothing at all on an empty result — see the page. An
     empty catalogue is a real state here: `getCatalogOrEmpty` returns one when
     the API is unreachable, which is always true inside `docker build`. */
  it('returns nothing for an empty catalogue rather than guessing', () => {
    expect(foundationCourses([])).toEqual([]);
  });
});
