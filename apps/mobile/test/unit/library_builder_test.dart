import 'package:ayman_mobile/core/data/profile/profile_me.dart';
import 'package:ayman_mobile/core/data/taxonomy/taxonomy.dart';
import 'package:ayman_mobile/features/library/domain/entities/catalog_course.dart';
import 'package:ayman_mobile/core/data/path/learning_path.dart';
import 'package:ayman_mobile/features/library/domain/library_builder.dart';
import 'package:flutter_test/flutter_test.dart';

/// The grouping and enrolment rules behind «الكورسات».
///
/// These are a port of the web's `lib/library.ts`, and the parity rule in
/// CLAUDE.md says the two must not drift. Every case below is a rule stated in
/// that file's comments — a course with no track belongs to every track in its
/// year, a student with no stream sees everything, «عام» sorts last — so a
/// change made on one side and not the other fails here.
void main() {
  CatalogCourse course({
    required String id,
    int year = 2,
    String? track,
    bool forGeneral = true,
    bool forLanguages = true,
    int lessonCount = 10,
    bool contentComplete = false,
  }) {
    return CatalogCourse(
      id: id,
      slug: 'course-$id',
      title: 'Course $id',
      systemSlug: 'bacalorya',
      systemNameAr: 'البكالوريا',
      year: year,
      trackLabelAr: track,
      subjectNameAr: 'البرمجة',
      lessonCount: lessonCount,
      totalSeconds: 3600,
      forGeneral: forGeneral,
      forLanguages: forLanguages,
      contentComplete: contentComplete,
    );
  }

  PathCourse enrolment({
    required String id,
    double percent = 40,
    int cleared = 4,
    int total = 10,
    String? nextLessonId = 'lesson-1',
    bool contentComplete = false,
  }) {
    return PathCourse(
      id: id,
      slug: 'course-$id',
      title: 'Course $id',
      subjectNameAr: 'البرمجة',
      published: true,
      progressPercent: percent,
      clearedLessons: cleared,
      totalLessons: total,
      contentComplete: contentComplete,
      nextLessonId: nextLessonId,
    );
  }

  ProfileMe profile({
    int? year = 2,
    String? trackId = 'track-eng',
    String? stream,
    bool onboardingCompleted = true,
  }) {
    return ProfileMe(
      userId: 'user-1',
      onboardingCompleted: onboardingCompleted,
      profile: StudentProfile(
        year: year,
        trackId: trackId,
        schoolStream: stream,
      ),
    );
  }

  final taxonomy = Taxonomy(
    governorates: const [],
    pinnedGovernorateCodes: const [],
    systems: const [
      EducationSystem(
        id: 'sys-1',
        slug: 'bacalorya',
        nameAr: 'البكالوريا',
        years: [
          AcademicYear(year: 1, labelAr: 'الصف الأول بكالوريا', badgeAr: 'أولى'),
          AcademicYear(year: 2, labelAr: 'الصف الثاني بكالوريا', badgeAr: 'تانية'),
        ],
        tracks: [
          Track(
            id: 'track-eng',
            slug: 'engineering_cs',
            labelAr: 'هندسة وعلوم حاسب',
            minYear: 2,
          ),
        ],
      ),
      // A SECOND system that labels the same years differently, and sorts
      // first. This is the trap `Taxonomy.yearLabel` exists to avoid: taking
      // "the first system with that year" renames a student's year whenever an
      // admin reorders an unrelated table.
      EducationSystem(
        id: 'sys-2',
        slug: 'thanaweya_amma',
        nameAr: 'الثانوية العامة',
        years: [
          AcademicYear(year: 2, labelAr: 'الصف الثاني الثانوي', badgeAr: 'تانية'),
        ],
        tracks: [],
      ),
    ],
  );

  group('identity', () {
    test('is null without a year — the strip prompts instead', () {
      final view = LibraryBuilder.build(
        courses: [course(id: 'a')],
        path: const [],
        me: profile(year: null),
        taxonomy: taxonomy,
      );

      expect(view.identity, isNull);
      // Null, NOT empty: «كورساتك» is hidden entirely rather than shown saying
      // there is nothing for a year we do not know.
      expect(view.yours, isNull);
      expect(view.rest.single.courseCount, 1);
    });

    test('is null without a taxonomy, and the grid still renders', () {
      final view = LibraryBuilder.build(
        courses: [course(id: 'a'), course(id: 'b', year: 1)],
        path: const [],
        me: profile(),
        taxonomy: null,
      );

      expect(view.identity, isNull);
      expect(view.totalCourses, 2);
      // Two years, both with a readable fallback heading.
      expect(view.rest.map((y) => y.year), [1, 2]);
      expect(view.rest.first.labelAr, 'الصف 1');
    });

    test('takes the year label from the platform system, not the first one',
        () {
      final view = LibraryBuilder.build(
        courses: const [],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      expect(view.identity!.yearLabelAr, 'الصف الثاني بكالوريا');
    });

    test('resolves the track label through the taxonomy', () {
      final view = LibraryBuilder.build(
        courses: const [],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      expect(view.identity!.trackLabelAr, 'هندسة وعلوم حاسب');
    });

    test('has no track in year 1 — tracks start in year 2', () {
      final view = LibraryBuilder.build(
        courses: const [],
        path: const [],
        me: profile(year: 1, trackId: null),
        taxonomy: taxonomy,
      );

      expect(view.identity!.trackLabelAr, isNull);
    });
  });

  group('own courses', () {
    test('takes the student year, their track, and untracked courses', () {
      final view = LibraryBuilder.build(
        courses: [
          course(id: 'mine', track: 'هندسة وعلوم حاسب'),
          course(id: 'shared'),
          course(id: 'other-track', track: 'علمي'),
          course(id: 'other-year', year: 1),
        ],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      final mine = view.yours!.expand((cell) => cell.courses).map((c) => c.id);
      expect(mine, ['mine', 'shared']);
    });

    test('does not HIDE another track — it moves to باقي الصفوف', () {
      final view = LibraryBuilder.build(
        courses: [
          course(id: 'mine', track: 'هندسة وعلوم حاسب'),
          course(id: 'other-track', track: 'علمي'),
        ],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      expect(view.totalCourses, 2);
      final rest = view.rest.single;
      expect(rest.year, 2);
      expect(rest.tracks.single.courses.single.id, 'other-track');
    });

    test('a student with NO stream still sees everything', () {
      // The rule that matters most: treating an unanswered question as «عام»
      // would quietly delete the لغات courses from a library they have been
      // looking at for weeks.
      final view = LibraryBuilder.build(
        courses: [
          course(id: 'languages-only', forGeneral: false),
          course(id: 'general-only', forLanguages: false),
        ],
        path: const [],
        me: profile(stream: null),
        taxonomy: taxonomy,
      );

      final mine = view.yours!.expand((cell) => cell.courses).map((c) => c.id);
      expect(mine, ['languages-only', 'general-only']);
    });

    test('a لغات student does not get a عام-only course', () {
      final view = LibraryBuilder.build(
        courses: [
          course(id: 'languages-only', forGeneral: false),
          course(id: 'general-only', forLanguages: false),
        ],
        path: const [],
        me: profile(stream: 'languages'),
        taxonomy: taxonomy,
      );

      expect(
        view.yours!.expand((cell) => cell.courses).map((c) => c.id),
        ['languages-only'],
      );
    });
  });

  group('grouping', () {
    test('the untracked cell sorts LAST', () {
      final view = LibraryBuilder.build(
        courses: [
          course(id: 'shared', year: 1),
          course(id: 'sci', year: 1, track: 'علمي'),
          course(id: 'lit', year: 1, track: 'أدبي'),
        ],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      // «عام» last, and the two named tracks in FIRST-SEEN order — the
      // catalogue's own `position` ordering, which an unstable sort would lose.
      expect(view.rest.single.tracks.map((t) => t.key), ['علمي', 'أدبي', '']);
    });

    test('other years run ascending', () {
      final view = LibraryBuilder.build(
        courses: [
          course(id: 'c', year: 3),
          course(id: 'a', year: 1),
        ],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      expect(view.rest.map((y) => y.year), [1, 3]);
    });

    test('the year count matches the cards under it', () {
      final view = LibraryBuilder.build(
        courses: [
          course(id: 'a', year: 1),
          course(id: 'b', year: 1, track: 'علمي'),
        ],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      final year = view.rest.single;
      expect(year.courseCount, 2);
      expect(
        year.tracks.fold<int>(0, (n, t) => n + t.courses.length),
        year.courseCount,
      );
    });
  });

  group('enrolment', () {
    test('an unenrolled course carries a NULL percent, never zero', () {
      final view = LibraryBuilder.build(
        courses: [course(id: 'a')],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      final card = view.yours!.single.courses.single;
      expect(card.progressPercent, isNull);
      expect(card.isEnrolled, isFalse);
      expect(card.clearedLessons, 0);
      expect(card.nextLessonId, isNull);
    });

    test('an enrolled course at 0% is a DIFFERENT state from unenrolled', () {
      final view = LibraryBuilder.build(
        courses: [course(id: 'a')],
        path: [enrolment(id: 'a', percent: 0, cleared: 0)],
        me: profile(),
        taxonomy: taxonomy,
      );

      final card = view.yours!.single.courses.single;
      expect(card.progressPercent, 0);
      expect(card.isEnrolled, isTrue);
    });

    test('carries the resume target and the cleared count', () {
      final view = LibraryBuilder.build(
        courses: [course(id: 'a')],
        path: [enrolment(id: 'a', percent: 40, cleared: 4)],
        me: profile(),
        taxonomy: taxonomy,
      );

      final card = view.yours!.single.courses.single;
      expect(card.progressPercent, 40);
      expect(card.clearedLessons, 4);
      expect(card.nextLessonId, 'lesson-1');
    });

    test('100% on a course still filling up is DONE but not COMPLETE', () {
      // The card says «خلّصت اللي نزل» here and «خلصت الكورس» only when the
      // catalogue says the content is complete. Saying the second tells a
      // student a course is over while three lectures are still to come.
      final view = LibraryBuilder.build(
        courses: [course(id: 'a', contentComplete: false)],
        path: [enrolment(id: 'a', percent: 100, cleared: 10)],
        me: profile(),
        taxonomy: taxonomy,
      );

      final card = view.yours!.single.courses.single;
      expect(card.isDone, isTrue);
      expect(card.contentComplete, isFalse);
    });

    test('an empty course is never "start" — it has nothing to start', () {
      final view = LibraryBuilder.build(
        courses: [course(id: 'a', lessonCount: 0)],
        path: const [],
        me: profile(),
        taxonomy: taxonomy,
      );

      expect(view.yours!.single.courses.single.isEmpty, isTrue);
    });

    test('an enrolment for a course NOT in the catalogue is ignored', () {
      // An unpublished course still has path rows. It must not conjure a card.
      final view = LibraryBuilder.build(
        courses: [course(id: 'a')],
        path: [enrolment(id: 'ghost')],
        me: profile(),
        taxonomy: taxonomy,
      );

      expect(view.totalCourses, 1);
      expect(view.yours!.single.courses.single.isEnrolled, isFalse);
    });
  });

  test('onboardingCompleted is carried, not derived from the identity', () {
    // A student can be fully onboarded and still have no year — the two states
    // send the prompt's button to different screens.
    final view = LibraryBuilder.build(
      courses: const [],
      path: const [],
      me: profile(year: null, onboardingCompleted: true),
      taxonomy: taxonomy,
    );

    expect(view.identity, isNull);
    expect(view.onboardingCompleted, isTrue);
  });
}
