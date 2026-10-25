import { describe, expect, it, vi } from 'vitest';
import type { CatalogCourse, LearningPath, ProfileMe, Taxonomy } from '@ayman/contracts';
import { parseTenantGrades } from '@ayman/contracts/grades';

/*
 * A stack with `TENANT_GRADES=prep1,prep2,prep3,sec1` — الإعدادي + أولى ثانوي,
 * where year 1 is two grades. `lib/tenant-grades.ts` reads the env at import,
 * so the module is replaced rather than the variable set.
 */
vi.mock('@/lib/tenant-grades', () => {
  const grades = parseTenantGrades('prep1,prep2,prep3,sec1');
  return { ASKS_GRADE: true, TENANT_GRADES: grades, TEACHES_PREPARATORY: true, STAGE_WORDS: {} };
});

const { buildLibrary } = await import('./library');

const taxonomy = {
  governorates: [],
  pinnedGovernorateCodes: [],
  systems: [
    {
      id: 'sys-prep',
      slug: 'preparatory',
      nameAr: 'المرحلة الإعدادية',
      years: [
        { year: 1, labelAr: 'الصف الأول الإعدادي', badgeAr: '' },
        { year: 2, labelAr: 'الصف الثاني الإعدادي', badgeAr: '' },
        { year: 3, labelAr: 'الصف الثالث الإعدادي', badgeAr: '' },
      ],
      tracks: [],
    },
    {
      id: 'sys-tha',
      slug: 'thanaweya_amma',
      nameAr: 'الثانوية العامة',
      years: [{ year: 1, labelAr: 'الصف الأول الثانوي', badgeAr: '' }],
      tracks: [],
    },
  ],
} as unknown as Taxonomy;

function course(id: string, systemSlug: string, year: number): CatalogCourse {
  return {
    id,
    slug: id,
    title: id,
    subtitle: null,
    systemSlug,
    systemNameAr: '',
    year,
    trackLabelAr: null,
    subjectNameAr: 'اللغة العربية',
    forGeneral: true,
    forLanguages: true,
    coverKey: null,
    lessonCount: 1,
    totalSeconds: 60,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as CatalogCourse;
}

const emptyPath: LearningPath = { courses: [], currentCourseId: null, clearedLessons: 0, totalLessons: 0, percent: 0 };

const me = (systemId: string, year: number): ProfileMe => ({
  userId: 'u1',
  onboardingCompleted: true,
  profile: { systemId, year, trackId: null } as unknown as ProfileMe['profile'],
});

describe('buildLibrary on a stack with grades', () => {
  const courses = [
    course('prep1-a', 'preparatory', 1),
    course('sec1-a', 'thanaweya_amma', 1),
    course('prep3-a', 'preparatory', 3),
  ];

  it('gives a أولى إعدادي student the prep year-1 course and not the secondary one', () => {
    const view = buildLibrary({ courses, path: emptyPath, me: me('sys-prep', 1), taxonomy });
    expect(view.identity?.yearLabelAr).toBe('الصف الأول الإعدادي');
    expect(view.yours?.flatMap((t) => t.courses.map((c) => c.id))).toEqual(['prep1-a']);
  });

  it('gives a أولى ثانوي student the secondary course and not the prep one', () => {
    const view = buildLibrary({ courses, path: emptyPath, me: me('sys-tha', 1), taxonomy });
    expect(view.yours?.flatMap((t) => t.courses.map((c) => c.id))).toEqual(['sec1-a']);
  });

  it('files the rest by grade, in the stack’s order, under each grade’s own name', () => {
    const view = buildLibrary({ courses, path: emptyPath, me: me('sys-tha', 1), taxonomy });
    expect(view.rest.map((g) => [g.key, g.labelAr])).toEqual([
      ['preparatory:1', 'الصف الأول الإعدادي'],
      ['preparatory:3', 'الصف الثالث الإعدادي'],
    ]);
  });
});
