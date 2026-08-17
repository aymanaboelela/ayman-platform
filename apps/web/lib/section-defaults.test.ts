import { describe, expect, it } from 'vitest';
import { StudentSectionSchema, type Taxonomy } from '@ayman/contracts';
import { fixedSectionFor, offeredYearOptions } from './section-defaults';

const ENGINEERING_TRACK = '11111111-1111-4111-8111-111111111111';
const OTHER_TRACK = '22222222-2222-4222-8222-222222222222';
const PROGRAMMING_OFFERING = '33333333-3333-4333-8333-333333333333';

function taxonomy(over: { tracks?: unknown[] } = {}): Taxonomy {
  return {
    governorates: [],
    pinnedGovernorateCodes: [],
    systems: [
      {
        id: 'sys-bac',
        slug: 'bacalorya',
        nameAr: 'البكالوريا المصرية',
        totalMarks: 320,
        passPercent: 50,
        allowsRetakes: true,
        years: [
          { year: 1, labelAr: 'الصف الأول بكالوريا', badgeAr: 'مرحلة تمهيدية' },
          { year: 2, labelAr: 'الصف الثاني بكالوريا', badgeAr: 'سنة شهادة' },
          { year: 3, labelAr: 'الصف الثالث بكالوريا', badgeAr: 'سنة شهادة' },
        ],
        tracks: over.tracks ?? [
          {
            id: OTHER_TRACK,
            slug: 'medicine_life_sciences',
            labelAr: 'مسار الطب وعلوم الحياة',
            minYear: 2,
            electiveGroups: [],
          },
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
                  {
                    id: 'offering-chem',
                    subjectId: 'subj-chem',
                    subjectSlug: 'chemistry',
                    nameAr: 'الكيمياء',
                  },
                  {
                    id: PROGRAMMING_OFFERING,
                    subjectId: 'subj-prog',
                    subjectSlug: 'programming_cs',
                    nameAr: 'البرمجة وعلوم الحاسب',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'sys-tha',
        slug: 'thanaweya_amma',
        nameAr: 'الثانوية العامة',
        totalMarks: 320,
        passPercent: 50,
        allowsRetakes: false,
        years: [{ year: 1, labelAr: 'الصف الأول الثانوي', badgeAr: 'سنة نقل' }],
        tracks: [],
      },
    ],
  } as unknown as Taxonomy;
}

describe('offeredYearOptions', () => {
  it('offers الأولى and التانية only — never the third year the taxonomy still describes', () => {
    expect(offeredYearOptions(taxonomy())).toEqual([
      { value: '1', label: 'الصف الأول بكالوريا' },
      { value: '2', label: 'الصف الثاني بكالوريا' },
    ]);
  });
});

describe('fixedSectionFor', () => {
  it('fills the engineering track and البرمجة for year 2', () => {
    expect(fixedSectionFor(taxonomy(), 2)).toEqual({
      system: 'bacalorya',
      year: 2,
      trackId: ENGINEERING_TRACK,
      electiveSubjectId: PROGRAMMING_OFFERING,
    });
  });

  it('leaves year 1 untracked — year 1 is common to every track', () => {
    expect(fixedSectionFor(taxonomy(), 1)).toEqual({ system: 'bacalorya', year: 1 });
  });

  /**
   * The reason every branch is asserted against the schema rather than only
   * against its own shape: this form has ONE visible field, so a payload the
   * refinement rejects would paint an error on a field that is not on screen
   * and leave a save button that does nothing.
   */
  it.each([1, 2])('builds a payload the schema accepts (year %s)', (year) => {
    expect(StudentSectionSchema.safeParse(fixedSectionFor(taxonomy(), year)).success).toBe(true);
  });

  it('degrades to the year alone — still valid — when the track is missing', () => {
    const section = fixedSectionFor(taxonomy({ tracks: [] }), 2);
    expect(section).toEqual({ system: 'bacalorya', year: 2 });
    expect(StudentSectionSchema.safeParse(section).success).toBe(true);
  });
});
