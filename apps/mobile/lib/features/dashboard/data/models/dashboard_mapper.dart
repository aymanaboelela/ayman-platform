import '../../domain/entities/continue_watching.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/enrolled_course.dart';
import '../../domain/entities/pending_exam.dart';
import '../../domain/entities/recent_score.dart';

/// Parses `GET /api/me/dashboard`.
///
/// Hand-written against `DashboardSchema` in `packages/contracts/src/progress.ts`.
/// Every nullable below is nullable in the schema too — none of them is a
/// defensive `?? ''`, because turning "this course has no cover" into "its
/// cover is the empty string" is how a null check downstream stops firing and
/// a blank panel ships instead of the generated artwork.
abstract final class DashboardMapper {
  static Dashboard fromJson(Map<String, dynamic> json) {
    return Dashboard(
      continueWatching: json['continueWatching'] == null
          ? null
          : _continueWatching(json['continueWatching'] as Map<String, dynamic>),
      enrolledCourses: _list(json['enrolledCourses'], _enrolledCourse),
      recentScores: _list(json['recentScores'], _recentScore),
      totalWatchedSeconds: (json['totalWatchedSeconds'] as num?)?.toInt() ?? 0,
      pendingExams: _list(json['pendingExams'], _pendingExam),
    );
  }

  /// Maps a JSON array, tolerating a null or a non-list.
  ///
  /// An ABSENT array is empty; a MALFORMED element still throws, and that is
  /// the split that matters. A missing optional section should render nothing;
  /// a course whose `totalLessons` came back as a string is the API having
  /// changed under us, and swallowing it would ship a home screen that is
  /// quietly missing courses.
  static List<T> _list<T>(
    dynamic raw,
    T Function(Map<String, dynamic>) map,
  ) {
    if (raw is! List) return const [];
    return raw
        .cast<Map<String, dynamic>>()
        .map(map)
        .toList(growable: false);
  }

  static ContinueWatching _continueWatching(Map<String, dynamic> json) {
    return ContinueWatching(
      courseId: json['courseId'] as String,
      courseSlug: json['courseSlug'] as String,
      courseTitle: json['courseTitle'] as String,
      lessonId: json['lessonId'] as String,
      lessonTitle: json['lessonTitle'] as String,
      lessonKind: json['lessonKind'] as String,
      progressPercent: (json['progressPercent'] as num).toDouble(),
      remainingSeconds: (json['remainingSeconds'] as num).toInt(),
    );
  }

  static EnrolledCourse _enrolledCourse(Map<String, dynamic> json) {
    return EnrolledCourse(
      id: json['id'] as String,
      slug: json['slug'] as String,
      title: json['title'] as String,
      coverKey: json['coverKey'] as String?,
      subjectNameAr: json['subjectNameAr'] as String,
      whatsappGroupUrl: json['whatsappGroupUrl'] as String?,
      published: json['published'] as bool,
      progressPercent: (json['progressPercent'] as num).toDouble(),
      completedLessons: (json['completedLessons'] as num).toInt(),
      totalLessons: (json['totalLessons'] as num).toInt(),
      lastLessonId: json['lastLessonId'] as String?,
      subscriptionValidUntil: _dateTime(json['subscriptionValidUntil']),
      comingSoonNote: json['comingSoonNote'] as String?,
      contentComplete: json['contentComplete'] as bool,
      bookTitle: json['bookTitle'] as String?,
      bookPriceCents: (json['bookPriceCents'] as num?)?.toInt(),
      scheduleNote: json['scheduleNote'] as String?,
    );
  }

  static RecentScore _recentScore(Map<String, dynamic> json) {
    return RecentScore(
      attemptId: json['attemptId'] as String,
      quizTitle: json['quizTitle'] as String,
      courseSlug: json['courseSlug'] as String,
      scorePercent: (json['scorePercent'] as num).toDouble(),
      submittedAt: DateTime.parse(json['submittedAt'] as String),
    );
  }

  static PendingExam _pendingExam(Map<String, dynamic> json) {
    return PendingExam(
      courseId: json['courseId'] as String,
      courseSlug: json['courseSlug'] as String,
      courseTitle: json['courseTitle'] as String,
      lessonId: json['lessonId'] as String,
      lessonTitle: json['lessonTitle'] as String,
    );
  }

  /// ISO-8601 from the API, always UTC.
  ///
  /// `.toLocal()` on the way in, so every screen formats a local time without
  /// having to remember to convert — and an expiry date does not read as a day
  /// early for a student in Cairo.
  static DateTime? _dateTime(dynamic raw) {
    if (raw is! String || raw.isEmpty) return null;
    return DateTime.parse(raw).toLocal();
  }
}
