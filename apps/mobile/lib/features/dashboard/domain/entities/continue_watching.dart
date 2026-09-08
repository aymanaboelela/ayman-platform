import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// Where the student stopped, and how much of that lesson is left.
///
/// The single most valuable thing on the home screen: it is the difference
/// between «افتح الكورس، دور على المحاضرة، دور على الدقيقة» and one tap.
@immutable
class ContinueWatching extends Equatable {
  const ContinueWatching({
    required this.courseId,
    required this.courseSlug,
    required this.courseTitle,
    required this.lessonId,
    required this.lessonTitle,
    required this.lessonKind,
    required this.progressPercent,
    required this.remainingSeconds,
  });

  final String courseId;
  final String courseSlug;
  final String courseTitle;
  final String lessonId;
  final String lessonTitle;

  /// `video` | `text` | `quiz` — kept as a String rather than an enum so a
  /// kind added server-side degrades to "unknown, render the generic row"
  /// instead of throwing at parse time and taking the whole screen down.
  final String lessonKind;

  final double progressPercent;

  /// How much of the lesson is left. Used for «فاضل ١٢ دقيقة» — a concrete
  /// number is what makes a student open it on a bus.
  final int remainingSeconds;

  int get remainingMinutes => (remainingSeconds / 60).ceil();

  @override
  List<Object?> get props => [
    courseId,
    courseSlug,
    courseTitle,
    lessonId,
    lessonTitle,
    lessonKind,
    progressPercent,
    remainingSeconds,
  ];
}
