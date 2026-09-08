import '../../../../core/data/network/json_parse.dart';
import '../../domain/entities/lesson_player.dart';
import '../../domain/entities/lesson_progress.dart';

/// Parses the player and progress endpoints.
///
/// Hand-written against `LessonPlayerSchema` and `LessonProgressSchema` in
/// `packages/contracts/src/progress.ts`.
abstract final class PlayerMapper {
  static LessonPlayer player(Map<String, dynamic> json) {
    final video = json['video'];
    final text = json['text'];
    final homework = json['homework'];
    final quiz = json['quiz'];

    return LessonPlayer(
      lesson: _lesson(json['lesson'] as Map<String, dynamic>),
      progress: progress(json['progress'] as Map<String, dynamic>),
      video: video is Map<String, dynamic> ? _video(video) : null,
      textHtml: text is Map<String, dynamic> ? text['bodyHtml'] as String? : null,
      homework: homework is Map<String, dynamic> ? _homework(homework) : null,
      quizId: quiz is Map<String, dynamic> ? quiz['id'] as String? : null,
      resources: jsonList(json['resources'], _resource),
      previous: _neighbour(json['previous']),
      next: _neighbour(json['next']),
      autoCompleteAvailable: json['autoCompleteAvailable'] as bool? ?? false,
    );
  }

  static PlayerLesson _lesson(Map<String, dynamic> json) {
    return PlayerLesson(
      id: json['id'] as String,
      courseId: json['courseId'] as String,
      courseSlug: json['courseSlug'] as String,
      courseTitle: json['courseTitle'] as String,
      sectionTitle: json['sectionTitle'] as String,
      title: json['title'] as String,
      kind: json['kind'] as String,
      estimatedSeconds: (json['estimatedSeconds'] as num?)?.toInt(),
    );
  }

  static PlayerVideo _video(Map<String, dynamic> json) {
    final mirror = json['mirror'];
    return PlayerVideo(
      youtubeId: json['youtubeId'] as String,
      durationSeconds: (json['durationSeconds'] as num?)?.toInt() ?? 0,
      posterUrl: json['posterUrl'] as String?,
      mirror: mirror is Map<String, dynamic>
          ? VideoMirror(
              hlsUrl: mirror['hlsUrl'] as String,
              maxHeight: (mirror['maxHeight'] as num?)?.toInt() ?? 0,
            )
          : null,
    );
  }

  static PlayerHomework _homework(Map<String, dynamic> json) {
    final submission = json['submission'];
    return PlayerHomework(
      body: json['body'] as String? ?? '',
      maxImages: (json['maxImages'] as num?)?.toInt() ?? 4,
      submission: submission is Map<String, dynamic>
          ? homeworkSubmission(submission)
          : null,
    );
  }

  static HomeworkSubmission homeworkSubmission(Map<String, dynamic> json) {
    return HomeworkSubmission(
      id: json['id'] as String,
      status: json['status'] as String,
      attempt: (json['attempt'] as num?)?.toInt() ?? 1,
      imageCount: (json['imageCount'] as num?)?.toInt() ?? 0,
      imageIds: jsonStrings(json['imageIds']),
      imagesPurged: json['imagesPurged'] as bool? ?? false,
      reviewNote: json['reviewNote'] as String?,
      grade: (json['grade'] as num?)?.toInt(),
      submittedAt: _date(json['submittedAt']),
      reviewedAt: _date(json['reviewedAt']),
    );
  }

  static PlayerResource _resource(Map<String, dynamic> json) {
    return PlayerResource(
      id: json['id'] as String,
      kind: json['kind'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      filename: json['filename'] as String?,
      mime: json['mime'] as String?,
      sizeBytes: (json['sizeBytes'] as num?)?.toInt(),
      youtubeId: json['youtubeId'] as String?,
      linkUrl: json['linkUrl'] as String?,
      viewPath: json['viewPath'] as String?,
      downloadPath: json['downloadPath'] as String?,
    );
  }

  static LessonNeighbour? _neighbour(dynamic raw) {
    if (raw is! Map<String, dynamic>) return null;
    return LessonNeighbour(
      id: raw['id'] as String,
      title: raw['title'] as String,
      kind: raw['kind'] as String,
    );
  }

  static LessonProgress progress(Map<String, dynamic> json) {
    return LessonProgress(
      lessonId: json['lessonId'] as String,
      state: json['state'] as String,
      completion: (json['completion'] as num?)?.toDouble() ?? 0,
      watchedSeconds: (json['watchedSeconds'] as num?)?.toInt() ?? 0,
      maxPositionSeconds: (json['maxPositionSeconds'] as num?)?.toInt() ?? 0,
      openCount: (json['openCount'] as num?)?.toInt() ?? 0,
      completedAt: _date(json['completedAt']),
      completedVia: json['completedVia'] as String?,
    );
  }

  /// `{ progress, justCompleted, courseProgressPercent }` — what heartbeat,
  /// dwell and complete all answer with.
  static HeartbeatResult heartbeat(Map<String, dynamic> json) {
    return HeartbeatResult(
      progress: progress(json['progress'] as Map<String, dynamic>),
      justCompleted: json['justCompleted'] as bool? ?? false,
      courseProgressPercent:
          (json['courseProgressPercent'] as num?)?.toDouble() ?? 0,
    );
  }

  static DateTime? _date(dynamic value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }
}
