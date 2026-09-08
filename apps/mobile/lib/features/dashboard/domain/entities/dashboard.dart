import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import 'continue_watching.dart';
import 'enrolled_course.dart';
import 'pending_exam.dart';
import 'recent_score.dart';

/// `GET /api/me/dashboard` — the one call the home screen cannot render
/// without.
///
/// The web issues TEN calls for this page and only THREE of them are allowed
/// to take it down. That policy is copied here deliberately: a 429 on the
/// tenth call must not blank the home screen, so everything optional is
/// fetched separately and degrades to its section simply not rendering.
@immutable
class Dashboard extends Equatable {
  const Dashboard({
    required this.enrolledCourses,
    required this.recentScores,
    required this.totalWatchedSeconds,
    required this.pendingExams,
    this.continueWatching,
  });

  /// Where the student left off, or null if they have never opened a lesson.
  final ContinueWatching? continueWatching;

  final List<EnrolledCourse> enrolledCourses;
  final List<RecentScore> recentScores;

  /// Summed `LessonProgress.watchedSeconds` across every enrolment — real
  /// watch time, not an estimate from lesson counts.
  final int totalWatchedSeconds;

  /// Courses whose exam is ready and has never been opened. Empty far more
  /// often than not.
  final List<PendingExam> pendingExams;

  // ── derived values, reproduced from `apps/web/lib/dashboard-view.ts` ─────
  //
  // Computed here rather than on the server for the same reason the web does
  // it client-side: they are presentation, and the API's job is to report the
  // measurements. Every formula below must match `summarise()` exactly — the
  // two surfaces showing a student different totals for the same account is
  // the failure this section exists to prevent.

  int get completedLessons =>
      enrolledCourses.fold(0, (sum, c) => sum + c.completedLessons);

  int get totalLessons => enrolledCourses.fold(0, (sum, c) => sum + c.totalLessons);

  /// Rounded, and 0 rather than NaN when nothing is enrolled.
  int get overallPercent =>
      totalLessons == 0 ? 0 : ((completedLessons / totalLessons) * 100).round();

  /// Null, NOT zero, when there are no marks yet.
  ///
  /// «متوسط درجاتك: ٠٪» in front of a student who has not sat an exam reads as
  /// a failing grade rather than as an absence.
  int? get averageScore {
    if (recentScores.isEmpty) return null;
    final total = recentScores.fold<double>(0, (sum, s) => sum + s.scorePercent);
    return (total / recentScores.length).round();
  }

  /// ⚠️ Counts by `completedLessons >= totalLessons`, NOT by
  /// `progressPercent`, which has been observed stuck stale on the server.
  int get completedCourseCount => enrolledCourses.where((c) => c.isComplete).length;

  bool get hasCourses => enrolledCourses.isNotEmpty;

  /// Whole hours, for «ساعات التعلم». Floored: claiming an hour the student
  /// has not watched is worse than under-reporting by 59 minutes.
  int get learningHours => totalWatchedSeconds ~/ 3600;

  @override
  List<Object?> get props => [
    continueWatching,
    enrolledCourses,
    recentScores,
    totalWatchedSeconds,
    pendingExams,
  ];
}
