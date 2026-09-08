import '../../../../core/data/network/json_parse.dart';
import '../../domain/entities/catalog_course.dart';
import '../../domain/entities/path_course.dart';

/// Parses the two list endpoints the library joins.
///
/// Hand-written against `CatalogListSchema` (`packages/contracts/src/catalog.ts`)
/// and `LearningPathSchema` (`packages/contracts/src/path.ts`). Only the fields
/// a screen reads are mapped: the catalogue also carries `bookTitle`,
/// `publishedAt` and the term prices, which belong to the store and the public
/// course page and would be dead weight here.
abstract final class LibraryMapper {
  /// `GET /api/catalog/courses` → `{ courses, total }`.
  static List<CatalogCourse> catalog(Map<String, dynamic> json) =>
      jsonList(json['courses'], _catalogCourse);

  /// `GET /api/me/path` → `{ courses, currentCourseId, … }`.
  ///
  /// Only the courses. The aggregate progress on the same payload belongs to
  /// «رحلتي»; the library needs one row per enrolled course and nothing else.
  static List<PathCourse> path(Map<String, dynamic> json) =>
      jsonList(json['courses'], _pathCourse);

  static CatalogCourse _catalogCourse(Map<String, dynamic> json) {
    return CatalogCourse(
      id: json['id'] as String,
      slug: json['slug'] as String,
      title: json['title'] as String,
      subtitle: json['subtitle'] as String?,
      systemSlug: json['systemSlug'] as String,
      systemNameAr: json['systemNameAr'] as String,
      year: (json['year'] as num).toInt(),
      trackLabelAr: json['trackLabelAr'] as String?,
      subjectNameAr: json['subjectNameAr'] as String,
      coverKey: json['coverKey'] as String?,
      lessonCount: (json['lessonCount'] as num).toInt(),
      totalSeconds: (json['totalSeconds'] as num).toInt(),
      forGeneral: json['forGeneral'] as bool,
      forLanguages: json['forLanguages'] as bool,
      emphasis: json['emphasis'] as String?,
      emphasisNote: json['emphasisNote'] as String?,
      contentComplete: json['contentComplete'] as bool,
      monthlyPriceCents: (json['monthlyPriceCents'] as num?)?.toInt(),
      quarterlyPriceCents: (json['quarterlyPriceCents'] as num?)?.toInt(),
      yearlyPriceCents: (json['yearlyPriceCents'] as num?)?.toInt(),
    );
  }

  static PathCourse _pathCourse(Map<String, dynamic> json) {
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
    );
  }
}
