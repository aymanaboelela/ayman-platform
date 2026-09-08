import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// A course whose exam is sitting ready and has never been opened.
@immutable
class PendingExam extends Equatable {
  const PendingExam({
    required this.courseId,
    required this.courseSlug,
    required this.courseTitle,
    required this.lessonId,
    required this.lessonTitle,
  });

  final String courseId;
  final String courseSlug;
  final String courseTitle;
  final String lessonId;
  final String lessonTitle;

  @override
  List<Object?> get props => [courseId, courseSlug, courseTitle, lessonId, lessonTitle];
}
