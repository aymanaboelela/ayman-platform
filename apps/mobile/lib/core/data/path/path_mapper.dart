import '../network/json_parse.dart';
import 'learning_path.dart';

/// Parses `GET /api/me/path`.
///
/// Hand-written against `LearningPathSchema` in
/// `packages/contracts/src/path.ts`.
abstract final class PathMapper {
  static LearningPath fromJson(Map<String, dynamic> json) {
    return LearningPath(
      courses: jsonList(json['courses'], course),
      currentCourseId: json['currentCourseId'] as String?,
      clearedLessons: (json['clearedLessons'] as num?)?.toInt() ?? 0,
      totalLessons: (json['totalLessons'] as num?)?.toInt() ?? 0,
      percent: (json['percent'] as num?)?.toDouble() ?? 0,
    );
  }

  static PathCourse course(Map<String, dynamic> json) {
    return PathCourse(
      id: json['id'] as String,
      slug: json['slug'] as String,
      title: json['title'] as String,
      subjectNameAr: json['subjectNameAr'] as String,
      coverKey: json['coverKey'] as String?,
      published: json['published'] as bool,
      progressPercent: (json['progressPercent'] as num).toDouble(),
      clearedLessons: (json['clearedLessons'] as num).toInt(),
      totalLessons: (json['totalLessons'] as num).toInt(),
      contentComplete: json['contentComplete'] as bool,
      whatsappGroupUrl: json['whatsappGroupUrl'] as String?,
      nextLessonId: json['nextLessonId'] as String?,
      nodes: jsonList(json['nodes'], _node),
    );
  }

  static PathNode _node(Map<String, dynamic> json) {
    return PathNode(
      id: json['id'] as String,
      lessonId: json['lessonId'] as String,
      title: json['title'] as String,
      kind: json['kind'] as String,
      state: json['state'] as String,
      gate: json['gate'] as String,
      isExam: json['isExam'] as bool,
    );
  }
}
