import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// A course the student is ENROLLED in, with their progress through it.
///
/// `GET /api/me/path` — the same rows the dashboard shows, plus the node tree
/// the path screen draws.
@immutable
class PathCourse extends Equatable {
  const PathCourse({
    required this.id,
    required this.slug,
    required this.title,
    required this.subjectNameAr,
    required this.published,
    required this.progressPercent,
    required this.clearedLessons,
    required this.totalLessons,
    required this.contentComplete,
    this.coverKey,
    this.whatsappGroupUrl,
    this.nextLessonId,
  });

  final String id;
  final String slug;
  final String title;
  final String subjectNameAr;
  final String? coverKey;
  final bool published;
  final double progressPercent;

  /// Lessons the student has CLEARED — completed, by whichever rule the
  /// course's `CompletionMode` sets.
  final int clearedLessons;

  final int totalLessons;
  final bool contentComplete;
  final String? whatsappGroupUrl;

  /// Where «نكمّل» goes. Null when they have never opened a lesson.
  final String? nextLessonId;

  /// ⚠️ Two different "finished" states, and the words differ.
  ///
  /// `contentComplete` false means the student has watched everything that
  /// EXISTS, and more is coming — «خلّصت اللي نزل». True means the course is
  /// done for good — «خلصت الكورس». Saying the second when the first is true
  /// tells a student a course is over when three lectures are still to come.
  bool get isCleared => totalLessons > 0 && clearedLessons >= totalLessons;

  @override
  List<Object?> get props => [id, slug, title, progressPercent, clearedLessons, totalLessons];
}
