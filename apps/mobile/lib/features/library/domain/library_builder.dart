import 'package:easy_localization/easy_localization.dart';

import '../../../core/data/path/learning_path.dart';
import '../../../core/data/profile/profile_me.dart';
import '../../../core/data/taxonomy/taxonomy.dart';
import '../../../core/localization/copy_keys.dart';
import 'entities/catalog_course.dart';
import 'entities/library_course.dart';
import 'entities/library_identity.dart';
import 'entities/library_track_group.dart';
import 'entities/library_view.dart';
import 'entities/library_year_group.dart';


/// The `/library` view model: the public catalogue joined to what THIS student
/// has actually done with it, then cut into the groups the screen renders.
///
/// A direct port of `apps/web/lib/library.ts`. ⚠️ The two must stay identical —
/// see the parity rule in `CLAUDE.md`. A change to the grouping on either side
/// that is not made on the other gives a student a different library on their
/// phone and on their laptop, and the disagreement is invisible from within
/// either one.
///
/// ## Why the join is on the CLIENT
///
/// Every input already has an endpoint that owns it: the catalogue is cached
/// for hours and shared with the marketing site, the path is authed and
/// per-request, the taxonomy is reference data every screen wants. A fifth
/// endpoint returning them pre-joined would put this rule in two places — here
/// and in Nest — with nothing keeping them equal, and would make the catalogue
/// uncacheable per student. The four reads are parallel, so joining here costs
/// nothing and makes the whole rule testable without a database.
///
/// ## The grouping rule
///
/// A course belongs to a `(year, track)` cell. `trackLabelAr == null` is not
/// "no group" — it means the course serves EVERY track in its year, which is
/// how year 1 works and how a shared year-2 course works. Those render under
/// «عام».
///
/// ## What "the student's own courses" means
///
/// Their year, either their track or no track at all, and a course that serves
/// their school. Anything else is another year's or another track's material:
/// still openable — nothing here is an entitlement check — but listed under
/// «باقي الصفوف» rather than counted as theirs.
///
/// ⚠️ This is a PRESENTATION rule, never an access rule. Access is decided by
/// `/api/lessons/:id/player` and the progression gate, which re-derive it on
/// every request. Nothing on this screen can grant or deny anything.
abstract final class LibraryBuilder {
  static LibraryView build({
    required List<CatalogCourse> courses,
    required List<PathCourse> path,
    required ProfileMe me,
    required Taxonomy? taxonomy,
  }) {
    final progress = {for (final course in path) course.id: course};
    final identity = identityOf(me, taxonomy);

    // A course `isOwnCourse` drops is not HIDDEN — it lands in «باقي الصفوف»
    // exactly as another track's course does, and is still openable.
    final own = identity == null
        ? const <CatalogCourse>[]
        : courses.where((course) => isOwnCourse(course, identity)).toList();
    final ownIds = own.map((course) => course.id).toSet();
    final rest = courses.where((course) => !ownIds.contains(course.id));

    LibraryCourse join(CatalogCourse course) {
      final enrolled = progress[course.id];
      return LibraryCourse(
        id: course.id,
        slug: course.slug,
        title: course.title,
        subtitle: course.subtitle,
        subjectNameAr: course.subjectNameAr,
        coverKey: course.coverKey,
        contentComplete: course.contentComplete,
        lessonCount: course.lessonCount,
        totalSeconds: course.totalSeconds,
        // Null, not zero, when there is no enrolment — the card reads the null
        // as «لسه ماابتديتش».
        progressPercent: enrolled?.progressPercent,
        clearedLessons: enrolled?.clearedLessons ?? 0,
        nextLessonId: enrolled?.nextLessonId,
      );
    }

    // The remaining years, ascending.
    final years = <int, List<CatalogCourse>>{};
    for (final course in rest) {
      years.putIfAbsent(course.year, () => []).add(course);
    }
    final sortedYears = years.keys.toList()..sort();

    return LibraryView(
      identity: identity,
      yours: identity == null ? null : _byTrack(own, join),
      rest: [
        for (final year in sortedYears)
          LibraryYearGroup(
            year: year,
            labelAr: _yearLabel(taxonomy, year),
            courseCount: years[year]!.length,
            tracks: _byTrack(years[year]!, join),
          ),
      ],
      totalCourses: courses.length,
      onboardingCompleted: me.onboardingCompleted,
    );
  }

  /// Who the student is, in labels rather than in ids.
  ///
  /// Null when the year is unknown OR the taxonomy could not be read. Those
  /// are different causes with the same correct outcome: the strip prompts
  /// rather than naming a cut it cannot describe. Nothing the taxonomy feeds
  /// is load-bearing — the grid still groups, because every course carries its
  /// own year and track label — so a taxonomy that never arrived degrades the
  /// HEADINGS, not the page.
  ///
  /// Shared with the dashboard's hero band, which needs exactly this and none
  /// of the rest of the library. The alternative was a second copy of the
  /// id→label lookup that could disagree with this one about what year 2 is
  /// called, which is a real risk now that the two systems label years
  /// differently.
  static LibraryIdentity? identityOf(ProfileMe me, Taxonomy? taxonomy) {
    final year = me.profile?.year;
    if (year == null || taxonomy == null) return null;

    final stream = me.profile?.schoolStream;
    return LibraryIdentity(
      year: year,
      yearLabelAr: taxonomy.yearLabel(year),
      trackLabelAr: taxonomy.trackLabel(me.profile?.trackId),
      schoolStream: stream,
      schoolStreamLabelAr: switch (stream) {
        'general' => tr(CopyKeys.streamGeneral),
        'languages' => tr(CopyKeys.streamLanguages),
        _ => null,
      },
    );
  }

  /// Their year, either their track or the untracked cell, and a course that
  /// serves their school.
  ///
  /// Written as ONE predicate rather than a filter chain so the parts cannot
  /// drift: a student with no track still sees every untracked course in their
  /// year — the correct year-1 behaviour — and a student with no stream still
  /// sees everything.
  ///
  /// Exported so the dashboard's recommended rail uses the same predicate
  /// rather than a second copy that could disagree about what "their track"
  /// means.
  ///
  /// ⚠️ Presentation, never access — see the note at the top.
  static bool isOwnCourse(CatalogCourse course, LibraryIdentity identity) {
    return course.year == identity.year &&
        (course.trackLabelAr == null ||
            course.trackLabelAr == identity.trackLabelAr) &&
        _servesStream(course, identity);
  }

  /// Does this course serve the student's school? مدرسة عام ولا مدرسة لغات.
  ///
  /// Two rules, and the second is the one that matters:
  ///
  /// - a course serving BOTH streams — the default every course was created
  ///   with — is everybody's, so nothing changes for content nobody has
  ///   tagged yet;
  /// - a student with NO stream matches everything. Treating them as «عام»
  ///   would quietly delete the لغات courses from a library they have been
  ///   looking at for weeks, on the strength of a question they were never
  ///   asked.
  static bool _servesStream(CatalogCourse course, LibraryIdentity identity) {
    return switch (identity.schoolStream) {
      null => true,
      'languages' => course.forLanguages,
      _ => course.forGeneral,
    };
  }

  /// Groups courses into track cells, in FIRST-SEEN order so the catalogue's
  /// own `position` ordering survives the grouping.
  ///
  /// «عام» is forced last: it reads as the fallback cell, and a fallback
  /// listed first makes the specific tracks look like an afterthought.
  static List<LibraryTrackGroup> _byTrack(
    List<CatalogCourse> courses,
    LibraryCourse Function(CatalogCourse) join,
  ) {
    final cells = <String, List<LibraryCourse>>{};
    for (final course in courses) {
      cells.putIfAbsent(course.trackLabelAr ?? '', () => []).add(join(course));
    }

    // ⚠️ NOT a sort. `List.sort` in Dart is UNSTABLE — its comparator returning
    // 0 for two named tracks lets it put them in any order it likes, and the
    // catalogue's `position` ordering, which is the whole reason the cells are
    // built in first-seen order, would survive on some inputs and not others.
    // (The web can sort here because ES2019 guarantees a stable one.) A `Map`
    // preserves insertion order, so moving the one known key to the end is
    // both cheaper and exactly right.
    final keys = cells.keys.where((key) => key.isNotEmpty).toList();
    if (cells.containsKey('')) keys.add('');

    return [
      for (final key in keys)
        LibraryTrackGroup(
          key: key,
          labelAr: key.isEmpty ? tr(CopyKeys.libraryTrackGeneral) : key,
          courses: cells[key]!,
        ),
    ];
  }

  /// The year's heading. Falls back inside [Taxonomy.yearLabel]; the null
  /// taxonomy is handled here so the whole page still renders without it.
  static String _yearLabel(Taxonomy? taxonomy, int year) =>
      taxonomy?.yearLabel(year) ?? 'الصف $year';
}
