import '../../../../core/data/network/json_parse.dart';
import '../../domain/entities/course_detail.dart';

/// Parses `GET /api/catalog/courses/:slug`.
///
/// Hand-written against `CatalogCourseDetailSchema` in
/// `packages/contracts/src/catalog.ts`.
abstract final class CourseMapper {
  static CourseDetail fromJson(Map<String, dynamic> json) {
    return CourseDetail(
      id: json['id'] as String,
      slug: json['slug'] as String,
      title: json['title'] as String,
      subtitle: json['subtitle'] as String?,
      systemNameAr: json['systemNameAr'] as String,
      trackLabelAr: json['trackLabelAr'] as String?,
      subjectNameAr: json['subjectNameAr'] as String,
      year: (json['year'] as num).toInt(),
      coverKey: json['coverKey'] as String?,
      lessonCount: (json['lessonCount'] as num).toInt(),
      totalSeconds: (json['totalSeconds'] as num).toInt(),
      contentComplete: json['contentComplete'] as bool,
      description: json['description'] as String?,
      comingSoonNote: json['comingSoonNote'] as String?,
      sections: jsonList(json['sections'], _section),
      terms: jsonList(json['terms'], _term),
      monthlyPriceCents: (json['monthlyPriceCents'] as num?)?.toInt(),
      quarterlyPriceCents: (json['quarterlyPriceCents'] as num?)?.toInt(),
      yearlyPriceCents: (json['yearlyPriceCents'] as num?)?.toInt(),
    );
  }

  static CourseSection _section(Map<String, dynamic> json) {
    return CourseSection(
      id: json['id'] as String,
      title: json['title'] as String,
      summary: json['summary'] as String?,
      lessons: jsonList(json['lessons'], _lesson),
    );
  }

  static CourseLesson _lesson(Map<String, dynamic> json) {
    return CourseLesson(
      id: json['id'] as String,
      title: json['title'] as String,
      kind: json['kind'] as String,
      estimatedSeconds: (json['estimatedSeconds'] as num).toInt(),
      isFreePreview: json['isFreePreview'] as bool,
      durationSeconds: (json['durationSeconds'] as num?)?.toInt(),
      forGeneral: json['forGeneral'] as bool,
      forLanguages: json['forLanguages'] as bool,
    );
  }

  static CourseTerm _term(Map<String, dynamic> json) {
    return CourseTerm(
      id: json['id'] as String,
      title: json['title'] as String,
      priceCents: (json['priceCents'] as num).toInt(),
    );
  }
}
