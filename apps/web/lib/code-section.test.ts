import { describe, expect, it, vi } from 'vitest';
import { StudentSectionSchema, type Taxonomy } from '@ayman/contracts';
import { parseTenantGrades } from '@ayman/contracts/grades';

vi.mock('@/lib/tenant-subject', () => ({ TEACHES_CODE: true }));
vi.mock('@/lib/tenant-grades', () => ({
  ASKS_GRADE: true,
  TENANT_GRADES: parseTenantGrades('prep3,bac1,bac2'),
}));

const { CODE_ASKS_GRADE, codeSectionFor } = await import('./code-section');

const ENGINEERING_TRACK = '11111111-1111-4111-8111-111111111111';
const PROGRAMMING_OFFERING = '33333333-3333-4333-8333-333333333333';

const year = (n: number, labelAr: string) => ({ year: n, labelAr, badgeAr: 'سنة' });
const system = (id: string, slug: string, nameAr: string, tracks: unknown[] = []) => ({
  id,
  slug,
  nameAr,
  totalMarks: 280,
  passPercent: 50,
  allowsRetakes: false,
  years: [year(1, `${nameAr} 1`), year(2, `${nameAr} 2`), year(3, `${nameAr} 3`)],
  tracks,
});

const taxonomy = {
  governorates: [],
  pinnedGovernorateCodes: [],
  systems: [
    system('sys-prep', 'preparatory', 'المرحلة الإعدادية'),
    system('sys-bac', 'bacalorya', 'البكالوريا المصرية', [
      {
        id: ENGINEERING_TRACK,
        slug: 'engineering_cs',
        labelAr: 'مسار الهندسة وعلوم الحاسب',
        minYear: 2,
        electiveGroups: [
          {
            id: 'group-1',
            year: 2,
            labelAr: 'المادة الاختيارية',
            pickCount: 1,
            options: [
              { id: PROGRAMMING_OFFERING, subjectId: 'subj-prog', subjectSlug: 'programming_cs', nameAr: 'البرمجة' },
            ],
          },
        ],
      },
    ]),
  ],
} as unknown as Taxonomy;

describe('codeSectionFor — a programming stack with grades', () => {
  it('is on when the stack teaches code AND names grades', () => {
    expect(CODE_ASKS_GRADE).toBe(true);
  });

  it('files «تالتة إعدادي» as الإعدادية year 3 — no track, no elective', () => {
    const section = codeSectionFor(taxonomy, { system: 'preparatory', year: 3 });
    expect(section).toEqual({ system: 'preparatory', year: 3, trackId: undefined, electiveSubjectId: undefined });
    expect(StudentSectionSchema.safeParse(section).success).toBe(true);
  });

  it('keeps the fixed section for a البكالوريا grade, as the year select wrote it', () => {
    expect(codeSectionFor(taxonomy, { system: 'bacalorya', year: 2 })).toEqual({
      system: 'bacalorya',
      year: 2,
      trackId: ENGINEERING_TRACK,
      electiveSubjectId: PROGRAMMING_OFFERING,
    });
  });

  it('falls back to the fixed section for a system the taxonomy does not have', () => {
    expect(codeSectionFor(taxonomy, { system: 'thanaweya_amma', year: 1 })).toEqual({ system: 'bacalorya', year: 1 });
  });
});
