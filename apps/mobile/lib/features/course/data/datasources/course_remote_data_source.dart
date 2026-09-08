import '../../../../core/data/network/api_client.dart';
import '../../domain/entities/course_detail.dart';
import '../models/course_mapper.dart';

class CourseRemoteDataSource {
  const CourseRemoteDataSource(this._client);

  final ApiClient _client;

  /// The public course detail — outline included.
  Future<Result<CourseDetail>> detail(String slug) {
    return _client.get<CourseDetail>(
      '/catalog/courses/${Uri.encodeComponent(slug)}',
      parse: (data) => CourseMapper.fromJson(data as Map<String, dynamic>),
    );
  }

  /// Enrols, and answers with where to resume.
  ///
  /// An upsert keyed on (userId, courseId) server-side, so pressing twice is
  /// not an error and an already-enrolled student resumes at their last lesson
  /// rather than being restarted or told «إنت مشترك أصلاً».
  ///
  /// ⚠️ `resumeLessonId` can be NULL: a published course with no published
  /// lessons. Navigating to `/lessons/null` is a 404 that reads like a broken
  /// button, so the caller has to check.
  Future<Result<String?>> enroll(String courseId) {
    return _client.post<String?>(
      '/courses/${Uri.encodeComponent(courseId)}/enroll',
      parse: (data) =>
          (data as Map<String, dynamic>)['resumeLessonId'] as String?,
    );
  }
}
