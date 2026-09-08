import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// A course the student is ENROLLED in, with their progress through it.
///
/// `GET /api/me/path` — the same rows the dashboard shows, plus the node tree
/// «رحلتي» and the course outline both draw.
///
/// Shared out of `features/` on purpose: «الكورسات», «رحلتي», «حسابي» and the
/// course page all read this one payload, and four private copies of the entity
/// is four places for the meaning of `clearedLessons` to drift.
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
    this.nodes = const [],
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

  /// Every lesson in the course, with the gate the server actually enforces
  /// and what this student has done with it — in reading order.
  ///
  /// The course outline joins these onto the CATALOGUE's section tree, which
  /// is the half that is identical for everyone and cached for hours.
  final List<PathNode> nodes;

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

/// One lesson's row in the student's own copy of a course.
///
/// ⚠️ [id] is NOT always a lesson id.
///
/// A quiz attached to a video lecture has no lesson row of its own — the API
/// emits a SECOND node for it whose [id] is the quiz's id and whose [lessonId]
/// points back at the lecture, because there is no separate page for it to
/// open. So a join keyed on [id] finds the lecture rows and silently misses
/// the attached quizzes, which is exactly what the course outline does and
/// what the web does: the catalogue's section tree has no row for them either.
@immutable
class PathNode extends Equatable {
  const PathNode({
    required this.id,
    required this.lessonId,
    required this.title,
    required this.kind,
    required this.state,
    required this.gate,
    required this.isExam,
  });

  /// The lesson id, or — for a quiz hanging off a lecture — the quiz's id.
  final String id;

  /// The page this row opens. Always a real lesson.
  final String lessonId;

  final String title;

  /// `video` | `quiz` | `attachment` | `text`.
  final String kind;

  /// `not_started` | `in_progress` | `completed` | `passed` | `failed`.
  final String state;

  /// `cleared` | `available` | `locked`.
  ///
  /// ⚠️ Presentation only. `/courses/:slug/lessons/:id` re-derives the gate on
  /// every request and 404s a locked exam; nothing a client does with this
  /// value opens anything.
  final String gate;

  /// The course's final exam. Gated on the WHOLE course, so it is never
  /// nested under a lecture.
  final bool isExam;

  @override
  List<Object?> get props => [id, lessonId, title, kind, state, gate, isExam];
}

/// `GET /api/me/path` in full.
@immutable
class LearningPath extends Equatable {
  const LearningPath({
    required this.courses,
    required this.clearedLessons,
    required this.totalLessons,
    required this.percent,
    this.currentCourseId,
  });

  final List<PathCourse> courses;

  /// The course the map opens on: the first with anything left to do.
  final String? currentCourseId;

  final int clearedLessons;
  final int totalLessons;

  /// Cleared ÷ total across EVERY enrolled course — NOT the mean of the
  /// per-course percentages. A student two lessons into a 40-lesson course and
  /// done with a 2-lesson one is 10% through, not 52%.
  final double percent;

  /// The student's row for one course, or null when they are not enrolled.
  PathCourse? courseById(String id) {
    for (final course in courses) {
      if (course.id == id) return course;
    }
    return null;
  }

  @override
  List<Object?> get props => [courses, currentCourseId, clearedLessons, totalLessons, percent];
}
