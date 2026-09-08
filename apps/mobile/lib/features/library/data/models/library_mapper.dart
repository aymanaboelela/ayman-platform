import '../../../../core/data/network/json_parse.dart';
import '../../domain/entities/catalog_course.dart';

/// Parses the public catalogue.
///
/// Hand-written against `CatalogListSchema` in
/// `packages/contracts/src/catalog.ts`. Only the fields a screen reads are
/// mapped: the payload also carries `bookTitle`, `publishedAt` and the term
/// prices, which belong to the store and the public course page.
abstract final class LibraryMapper {
  /// `GET /api/catalog/courses` → `{ courses, total }`.
  static List<CatalogCourse> catalog(Map<String, dynamic> json) =>
      jsonList(json['courses'], _catalogCourse);

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
}
