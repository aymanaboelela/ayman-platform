import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One course, as the SIGNED-IN student sees it: the catalogue row joined to
/// what they have actually done with it.
///
/// Deliberately not [CatalogCourse]. That one is the public catalogue and
/// carries prices and emphasis copy meant to sell a course to a stranger; this
/// one answers a different question — how far am I through this, and what is
/// the one thing to press.
@immutable
class LibraryCourse extends Equatable {
  const LibraryCourse({
    required this.id,
    required this.slug,
    required this.title,
    required this.subjectNameAr,
    required this.lessonCount,
    required this.totalSeconds,
    required this.clearedLessons,
    required this.contentComplete,
    this.subtitle,
    this.coverKey,
    this.progressPercent,
    this.nextLessonId,
  });

  final String id;
  final String slug;
  final String title;
  final String? subtitle;
  final String subjectNameAr;
  final String? coverKey;
  final int lessonCount;
  final int totalSeconds;

  /// ⚠️ NULL is the "not enrolled" flag, and it is the only one.
  ///
  /// Zero is a real, different state — an enrolled student who has not watched
  /// anything — and the card says «لسه ماابتديتش» for one and «خلصت ٠٪» for
  /// the other. A `?? 0` anywhere near this collapses the two.
  final double? progressPercent;

  final int clearedLessons;

  /// Whether every lesson the course will EVER have is published. Gates
  /// «خلصت الكورس» against «خلّصت اللي نزل».
  final bool contentComplete;

  /// Where «نكمّل» points. Null when not enrolled, or when nothing is next.
  final String? nextLessonId;

  bool get isEnrolled => progressPercent != null;

  /// Everything published has been cleared.
  bool get isDone => progressPercent == 100;

  /// A course with nothing published in it.
  ///
  /// It still LINKS — the course page explains the state and offers the rest
  /// of the catalogue — but it stops claiming to start anything. «نبدأ
  /// الكورس» on a course with no lessons is a promise that breaks one screen
  /// later, on a button that does nothing.
  bool get isEmpty => lessonCount == 0;

  @override
  List<Object?> get props => [
    id,
    slug,
    title,
    progressPercent,
    clearedLessons,
    lessonCount,
    nextLessonId,
  ];
}
