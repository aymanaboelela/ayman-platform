import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentSectionSchema } from '@ayman/contracts/onboarding';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { subjectCopy } from '@ayman/contracts/copy/subject';

/**
 * The section a student gives on a stack that does not teach code.
 *
 * Asserted against a taxonomy shaped like the seeded one — both systems, their
 * own year labels, Bakalorya tracks with a year-2 elective group, Thanaweya
 * tracks with none — because every rule here is a statement about how those
 * pieces fit together, and a fixture missing one of them would let the rule it
 * tests pass by having nothing to check.
 *
 * The elective rule reads `TENANT_SUBJECT`, which is decided at module load,
 * so the module is re-imported under a physics stack's environment.
 */
const MEDICINE = 'track-medicine';
const ENGINEERING = 'track-engineering';
const SCIENCE_MATH = 'track-science-math';
const PHYSICS_ELECTIVE = 'offering-physics-y2';

const TAXONOMY = {
  governorates: [],
  pinnedGovernorateCodes: [],
  systems: [
    {
      id: 'sys-bac',
      slug: 'bacalorya',
      nameAr: 'البكالوريا المصرية',
      totalMarks: 600,
      passPercent: 70,
      allowsRetakes: true,
      years: [
        { year: 1, labelAr: 'الصف الأول بكالوريا', badgeAr: 'مرحلة تمهيدية' },
        { year: 2, labelAr: 'الصف الثاني بكالوريا', badgeAr: 'سنة شهادة' },
        { year: 3, labelAr: 'الصف الثالث بكالوريا', badgeAr: 'سنة شهادة' },
      ],
      tracks: [
        {
          id: MEDICINE,
          slug: 'medicine_life_sciences',
          labelAr: 'مسار الطب وعلوم الحياة',
          minYear: 2,
          electiveGroups: [
            {
              id: 'group-medicine',
              year: 2,
              labelAr: 'المادة الاختيارية',
              pickCount: 1,
              options: [
                { id: 'offering-math-y2', subjectId: 's-math', subjectSlug: 'mathematics', nameAr: 'الرياضيات' },
                { id: PHYSICS_ELECTIVE, subjectId: 's-phys', subjectSlug: 'physics', nameAr: 'الفيزياء' },
              ],
            },
          ],
        },
        {
          id: ENGINEERING,
          slug: 'engineering_cs',
          labelAr: 'مسار الهندسة وعلوم الحاسب',
          minYear: 2,
          electiveGroups: [
            {
              id: 'group-engineering',
              year: 2,
              labelAr: 'المادة الاختيارية',
              pickCount: 1,
              options: [
                { id: 'offering-chem-y2', subjectId: 's-chem', subjectSlug: 'chemistry', nameAr: 'الكيمياء' },
                { id: 'offering-prog-y2', subjectId: 's-prog', subjectSlug: 'programming_cs', nameAr: 'البرمجة وعلوم الحاسب' },
              ],
            },
          ],
        },
      ],
      subjects: [],
    },
    {
      id: 'sys-tha',
      slug: 'thanaweya_amma',
      nameAr: 'الثانوية العامة',
      totalMarks: 320,
      passPercent: 50,
      allowsRetakes: false,
      years: [
        { year: 1, labelAr: 'الصف الأول الثانوي', badgeAr: 'سنة نقل' },
        { year: 2, labelAr: 'الصف الثاني الثانوي', badgeAr: 'سنة نقل' },
        { year: 3, labelAr: 'الصف الثالث الثانوي', badgeAr: 'سنة شهادة' },
      ],
      tracks: [
        { id: SCIENCE_MATH, slug: 'science_math', labelAr: 'علمي رياضة', minYear: 2, electiveGroups: [] },
      ],
      subjects: [],
    },
  ],
} as unknown as Taxonomy;

const saved = { key: process.env.TENANT_KEY, subject: process.env.TENANT_SUBJECT };

afterEach(() => {
  for (const [name, value] of [
    ['TENANT_KEY', saved.key],
    ['TENANT_SUBJECT', saved.subject],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.resetModules();
});

async function physicsStack() {
  process.env.TENANT_KEY = 'demo';
  process.env.TENANT_SUBJECT = 'physics';
  vi.resetModules();
  return import('./subject-section');
}

describe('the options', () => {
  it('offers both systems, by their own names', async () => {
    const { systemOptions } = await physicsStack();
    expect(systemOptions(TAXONOMY)).toEqual([
      { value: 'bacalorya', label: 'البكالوريا المصرية' },
      { value: 'thanaweya_amma', label: 'الثانوية العامة' },
    ]);
  });

  it('offers no year until a system is chosen, then that system’s three, in its own words', async () => {
    const { yearOptionsFor } = await physicsStack();
    expect(yearOptionsFor(TAXONOMY, undefined)).toEqual([]);
    expect(yearOptionsFor(TAXONOMY, 'thanaweya_amma').map((option) => option.label)).toEqual([
      'الصف الأول الثانوي',
      'الصف الثاني الثانوي',
      'الصف الثالث الثانوي',
    ]);
  });

  it('offers tracks from year 2 on, and only the chosen system’s', async () => {
    const { trackOptionsFor } = await physicsStack();
    expect(trackOptionsFor(TAXONOMY, 'bacalorya', 1)).toEqual([]);
    expect(trackOptionsFor(TAXONOMY, 'bacalorya', 3).map((option) => option.value)).toEqual([
      MEDICINE,
      ENGINEERING,
    ]);
    expect(trackOptionsFor(TAXONOMY, 'thanaweya_amma', 2).map((option) => option.value)).toEqual([
      SCIENCE_MATH,
    ]);
  });
});

describe('subjectSectionFor', () => {
  it('files a الثانوية العامة student under الثانوية العامة, not the platform’s old default', async () => {
    const { subjectSectionFor } = await physicsStack();
    const section = subjectSectionFor(TAXONOMY, {
      system: 'thanaweya_amma',
      year: 3,
      trackId: SCIENCE_MATH,
    });
    expect(section).toMatchObject({ system: 'thanaweya_amma', year: 3, trackId: SCIENCE_MATH });
    expect(section.electiveSubjectId).toBeUndefined();
  });

  it('fills the elective when THIS stack’s subject is one of the track’s options that year', async () => {
    const { subjectSectionFor } = await physicsStack();
    expect(
      subjectSectionFor(TAXONOMY, { system: 'bacalorya', year: 2, trackId: MEDICINE }).electiveSubjectId,
    ).toBe(PHYSICS_ELECTIVE);
    // Physics is not an option on the engineering track's year-2 pair, so
    // nothing is invented there.
    expect(
      subjectSectionFor(TAXONOMY, { system: 'bacalorya', year: 2, trackId: ENGINEERING })
        .electiveSubjectId,
    ).toBeUndefined();
  });

  it('carries the track key as `undefined` in year 1, so a stale one cannot ride through', async () => {
    // react-hook-form keeps a value after its select unmounts; the spread over
    // the form's values is what has to overwrite it.
    const { subjectSectionFor } = await physicsStack();
    const section = subjectSectionFor(TAXONOMY, { system: 'bacalorya', year: 1, trackId: MEDICINE });
    expect('trackId' in section && section.trackId === undefined).toBe(true);
    expect({ ...{ trackId: MEDICINE }, ...section }.trackId).toBeUndefined();
  });

  it('drops a track that is not one of the system’s', async () => {
    const { subjectSectionFor } = await physicsStack();
    expect(
      subjectSectionFor(TAXONOMY, { system: 'thanaweya_amma', year: 2, trackId: MEDICINE }).trackId,
    ).toBeUndefined();
  });

  it('only ever builds a section the shared schema accepts', async () => {
    const { subjectSectionFor } = await physicsStack();
    for (const system of ['bacalorya', 'thanaweya_amma', undefined]) {
      for (const year of [1, 2, 3]) {
        for (const trackId of [MEDICINE, ENGINEERING, SCIENCE_MATH, undefined]) {
          const section = JSON.parse(JSON.stringify(subjectSectionFor(TAXONOMY, { system, year, trackId })));
          expect(StudentSectionSchema.safeParse(section).success, JSON.stringify(section)).toBe(true);
        }
      }
    }
  });
});

describe('sectionFieldErrors', () => {
  it('asks for the system', async () => {
    const { sectionFieldErrors } = await physicsStack();
    expect(sectionFieldErrors({ year: 2 }, TAXONOMY).system).toBe(subjectCopy.onboarding.systemError);
  });

  it('asks for the track from year 2 on, and not in year 1', async () => {
    const { sectionFieldErrors } = await physicsStack();
    expect(sectionFieldErrors({ system: 'bacalorya', year: 2 }, TAXONOMY).trackId).toBe(
      subjectCopy.onboarding.trackError,
    );
    expect(sectionFieldErrors({ system: 'bacalorya', year: 1 }, TAXONOMY)).toEqual({});
    expect(
      sectionFieldErrors({ system: 'bacalorya', year: 3, trackId: ENGINEERING }, TAXONOMY),
    ).toEqual({});
  });

  it('refuses a track left over from another system', async () => {
    const { sectionFieldErrors } = await physicsStack();
    expect(
      sectionFieldErrors({ system: 'thanaweya_amma', year: 2, trackId: MEDICINE }, TAXONOMY).trackId,
    ).toBe(subjectCopy.onboarding.trackError);
  });
});

describe('systemSlugOf', () => {
  it('turns a stored id back into the slug the form speaks', async () => {
    const { systemSlugOf } = await physicsStack();
    expect(systemSlugOf(TAXONOMY, 'sys-tha')).toBe('thanaweya_amma');
    expect(systemSlugOf(TAXONOMY, null)).toBeUndefined();
    expect(systemSlugOf(TAXONOMY, 'sys-unknown')).toBeUndefined();
  });
});
