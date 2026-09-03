import { describe, expect, it } from 'vitest';
import type { CatalogCourse, LearningPath, ProfileMe, Taxonomy } from '@ayman/contracts';
import { buildLibrary } from './library';

const TRACK_LANG = '11111111-1111-4111-8111-111111111111';
const TRACK_GENERAL = '22222222-2222-4222-8222-222222222222';

const taxonomy = {
  governorates: [],
  pinnedGovernorateCodes: [],
  systems: [
    {
      id: 'sys-1',
      slug: 'bacc',
      nameAr: 'البكالوريا',
      totalMarks: 320,
      passPercent: 50,
      allowsRetakes: true,
      years: [
        { year: 1, labelAr: 'الصف الأول بكالوريا', badgeAr: 'أولى' },
        { year: 2, labelAr: 'الصف الثاني بكالوريا', badgeAr: 'تانية' },
      ],
      tracks: [
        { id: TRACK_LANG, slug: 'lang', labelAr: 'لغات', minYear: 2, electiveGroups: [] },
        { id: TRACK_GENERAL, slug: 'gen', labelAr: 'علمي', minYear: 2, electiveGroups: [] },
      ],
    },
  ],
} as unknown as Taxonomy;

function course(over: Partial<CatalogCourse> & { id: string }): CatalogCourse {
  return {
    slug: over.id,
    title: over.id,
    subtitle: null,
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا',
    year: 2,
    trackLabelAr: null,
    subjectNameAr: 'برمجة',
    // The columns' own defaults: a course nobody has tagged serves both
    // schools. Named here because this factory casts, so an omission is not a
    // type error — it just hands the stream predicate `undefined` and drops
    // every course. `CatalogCourseSchema` requires both, so a real payload
    // cannot arrive without them.
    forGeneral: true,
    forLanguages: true,
    coverKey: null,
    lessonCount: 10,
    totalSeconds: 3600,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as CatalogCourse;
}

const emptyPath: LearningPath = {
  courses: [],
  currentCourseId: null,
  clearedLessons: 0,
  totalLessons: 0,
  percent: 0,
};

function profile(over: Record<string, unknown> | null): ProfileMe {
  return {
    userId: 'u1',
    onboardingCompleted: over !== null,
    profile: over as ProfileMe['profile'],
  };
}

describe('buildLibrary — the student’s own cell', () => {
  it('keeps their year and their track, and drops another track’s course', () => {
    const view = buildLibrary({
      courses: [
        course({ id: 'mine', year: 2, trackLabelAr: 'لغات' }),
        course({ id: 'theirs', year: 2, trackLabelAr: 'علمي' }),
      ],
      path: emptyPath,
      me: profile({ year: 2, trackId: TRACK_LANG }),
      taxonomy,
    });

    expect(view.yours?.flatMap((t) => t.courses.map((x) => x.id))).toEqual(['mine']);
    expect(view.rest.flatMap((y) => y.tracks.flatMap((t) => t.courses.map((x) => x.id)))).toEqual([
      'theirs',
    ]);
  });

  it('counts an UNTRACKED course in their year as theirs', () => {
    // `trackLabelAr === null` means "every track in this year", not "no group".
    // A shared year-2 course belongs to the لغات student as much as to any other.
    const view = buildLibrary({
      courses: [course({ id: 'shared', year: 2, trackLabelAr: null })],
      path: emptyPath,
      me: profile({ year: 2, trackId: TRACK_LANG }),
      taxonomy,
    });

    expect(view.yours?.[0]?.labelAr).toBe('عام');
    expect(view.rest).toHaveLength(0);
  });

  it('gives a year-1 student — who has no track — their whole year', () => {
    const view = buildLibrary({
      courses: [
        course({ id: 'y1', year: 1, trackLabelAr: null }),
        course({ id: 'y2', year: 2, trackLabelAr: 'لغات' }),
      ],
      path: emptyPath,
      me: profile({ year: 1, trackId: null }),
      taxonomy,
    });

    expect(view.identity).toEqual({
      year: 1,
      yearLabelAr: 'الصف الأول بكالوريا',
      trackLabelAr: null,
      schoolStream: null,
      schoolStreamLabelAr: null,
    });
    expect(view.yours?.flatMap((t) => t.courses.map((x) => x.id))).toEqual(['y1']);
  });

  /**
   * مدرسة عام ولا لغات — the student's half of the split the catalog has
   * carried on every course since `20260808000000_school_stream`.
   */
  describe('the school stream', () => {
    const streamed = (over: Partial<CatalogCourse> & { id: string }) =>
      course({ year: 2, trackLabelAr: null, ...over });

    it('drops a لغات-only course for a general-school student', () => {
      const view = buildLibrary({
        courses: [
          streamed({ id: 'both' }),
          streamed({ id: 'languages-only', forGeneral: false, forLanguages: true }),
        ],
        path: emptyPath,
        me: profile({ year: 2, trackId: null, schoolStream: 'general' }),
        taxonomy,
      });

      expect(view.yours?.flatMap((t) => t.courses.map((x) => x.id))).toEqual(['both']);
      // Dropped from «كورساتك», NOT hidden — it is still on the page, under
      // the other-years heading, exactly like another track's course.
      expect(view.rest.flatMap((y) => y.tracks.flatMap((t) => t.courses.map((x) => x.id)))).toEqual(
        ['languages-only'],
      );
    });

    it('drops a عام-only course for a languages-school student', () => {
      const view = buildLibrary({
        courses: [
          streamed({ id: 'general-only', forGeneral: true, forLanguages: false }),
          streamed({ id: 'languages-only', forGeneral: false, forLanguages: true }),
        ],
        path: emptyPath,
        me: profile({ year: 2, trackId: null, schoolStream: 'languages' }),
        taxonomy,
      });

      expect(view.yours?.flatMap((t) => t.courses.map((x) => x.id))).toEqual(['languages-only']);
    });

    /**
     * The case that decides whether this change is safe to ship. Every profile
     * created before the question existed has no stream, and treating them as
     * «عام» would silently delete the لغات courses from a library they have
     * been reading for weeks — on the strength of a question nobody asked them.
     */
    it('filters nothing for a student who was never asked', () => {
      const view = buildLibrary({
        courses: [
          streamed({ id: 'general-only', forGeneral: true, forLanguages: false }),
          streamed({ id: 'languages-only', forGeneral: false, forLanguages: true }),
        ],
        path: emptyPath,
        me: profile({ year: 2, trackId: null }),
        taxonomy,
      });

      expect(view.yours?.flatMap((t) => t.courses.map((x) => x.id))).toEqual([
        'general-only',
        'languages-only',
      ]);
      expect(view.identity?.schoolStreamLabelAr).toBeNull();
    });

    it('names the stream on the identity, so the cut is visible', () => {
      const view = buildLibrary({
        courses: [streamed({ id: 'a' })],
        path: emptyPath,
        me: profile({ year: 2, trackId: null, schoolStream: 'languages' }),
        taxonomy,
      });

      expect(view.identity?.schoolStreamLabelAr).toBe('لغات');
    });
  });

  it('has no identity — and no “yours” — before onboarding sets a year', () => {
    const view = buildLibrary({
      courses: [course({ id: 'a' })],
      path: emptyPath,
      me: profile(null),
      taxonomy,
    });

    expect(view.identity).toBeNull();
    expect(view.yours).toBeNull();
    // Nothing is theirs, so nothing is hidden: the whole catalog is browsable.
    expect(view.rest.flatMap((y) => y.tracks.flatMap((t) => t.courses))).toHaveLength(1);
  });
});

describe('buildLibrary — switching section moves courses, it never deletes progress', () => {
  /**
   * The founder's requirement, stated twice and in tension with itself: changing
   * section "resets my evaluations to zero", but switching back "brings them
   * all in again". Only one implementation satisfies both — progress stays on
   * the enrollment and the SELECTION decides which courses are on screen. A
   * literal reset would satisfy the first sentence and make the second
   * impossible.
   */
  const courses = [
    course({ id: 'lang-1', year: 2, trackLabelAr: 'لغات' }),
    course({ id: 'gen-1', year: 2, trackLabelAr: 'علمي' }),
  ];
  const path: LearningPath = {
    ...emptyPath,
    courses: [
      {
        id: 'lang-1',
        slug: 'lang-1',
        title: 'lang-1',
        subjectNameAr: 'اللغة الأجنبية الأولى',
        coverKey: null,
        contentComplete: false,
        published: true,
        progressPercent: 60,
        clearedLessons: 6,
        totalLessons: 10,
        nextLessonId: 'lesson-7',
        nodes: [],
      },
    ],
    clearedLessons: 6,
    totalLessons: 10,
    percent: 60,
  };

  it('shows 60% while they are on لغات', () => {
    const view = buildLibrary({ courses, path, me: profile({ year: 2, trackId: TRACK_LANG }), taxonomy });
    expect(view.yours?.[0]?.courses[0]).toMatchObject({ id: 'lang-1', progressPercent: 60 });
  });

  it('shows a fresh, unstarted cell after they switch to علمي', () => {
    const view = buildLibrary({ courses, path, me: profile({ year: 2, trackId: TRACK_GENERAL }), taxonomy });
    expect(view.yours?.[0]?.courses[0]).toMatchObject({ id: 'gen-1', progressPercent: null });
  });

  it('restores the 60% intact when they switch back', () => {
    const view = buildLibrary({ courses, path, me: profile({ year: 2, trackId: TRACK_LANG }), taxonomy });
    expect(view.yours?.[0]?.courses[0]?.progressPercent).toBe(60);
    expect(view.yours?.[0]?.courses[0]?.clearedLessons).toBe(6);
  });
});

describe('buildLibrary — ordering', () => {
  it('lists the remaining years ascending', () => {
    const view = buildLibrary({
      courses: [course({ id: 'c3', year: 3 }), course({ id: 'c1', year: 1 })],
      path: emptyPath,
      me: profile({ year: 2, trackId: TRACK_LANG }),
      taxonomy,
    });
    expect(view.rest.map((y) => y.year)).toEqual([1, 3]);
  });

  it('puts the عام cell last so the named tracks lead', () => {
    const view = buildLibrary({
      courses: [
        course({ id: 'shared', year: 2, trackLabelAr: null }),
        course({ id: 'lang', year: 2, trackLabelAr: 'لغات' }),
      ],
      path: emptyPath,
      me: profile({ year: 2, trackId: TRACK_LANG }),
      taxonomy,
    });
    expect(view.yours?.map((t) => t.labelAr)).toEqual(['لغات', 'عام']);
  });
});
