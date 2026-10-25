import { describe, expect, it, vi } from 'vitest';
import { parseTenantGrades } from '@ayman/contracts/grades';

vi.mock('@/lib/tenant-grades', () => ({
  ASKS_GRADE: true,
  TENANT_GRADES: parseTenantGrades('prep1,prep2,prep3,sec1'),
}));

const { courseYearLabel, yearPageOf, yearPages } = await import('./grade-pages');

describe('grade pages', () => {
  it('has one page per grade, keyed by slug', () => {
    expect(yearPages().map((p) => [p.segment, p.title])).toEqual([
      ['prep1', 'الصف الأول الإعدادي'],
      ['prep2', 'الصف الثاني الإعدادي'],
      ['prep3', 'الصف الثالث الإعدادي'],
      ['sec1', 'الصف الأول الثانوي'],
    ]);
  });

  it('404s the numbered pages and a grade the stack does not teach', () => {
    expect(yearPageOf('1')).toBeNull();
    expect(yearPageOf('sec2')).toBeNull();
  });

  it('matches a course by system AND year', () => {
    const page = yearPageOf('prep1')!;
    expect(page.matches({ systemSlug: 'preparatory', year: 1 })).toBe(true);
    expect(page.matches({ systemSlug: 'thanaweya_amma', year: 1 })).toBe(false);
  });

  it('labels a course by its grade, from the slug or the seeded system name', () => {
    expect(courseYearLabel({ systemSlug: 'thanaweya_amma', year: 1 })).toBe('الصف الأول الثانوي');
    expect(courseYearLabel({ systemNameAr: 'المرحلة الإعدادية', year: 2 })).toBe('الصف الثاني الإعدادي');
  });
});
