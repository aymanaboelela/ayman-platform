import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// A published course, as the public catalogue reports it.
///
/// The catalogue is the same list the marketing site shows; the library is
/// that list inside the signed-in shell. The app only ever needs this one.
@immutable
class CatalogCourse extends Equatable {
  const CatalogCourse({
    required this.id,
    required this.slug,
    required this.title,
    required this.systemSlug,
    required this.systemNameAr,
    required this.year,
    required this.subjectNameAr,
    required this.lessonCount,
    required this.totalSeconds,
    required this.forGeneral,
    required this.forLanguages,
    required this.contentComplete,
    this.subtitle,
    this.trackLabelAr,
    this.coverKey,
    this.emphasis,
    this.emphasisNote,
    this.monthlyPriceCents,
    this.quarterlyPriceCents,
    this.yearlyPriceCents,
  });

  final String id;
  final String slug;
  final String title;
  final String? subtitle;

  /// `bacalorya` | `thanaweya_amma`. The two education systems run in
  /// PARALLEL, and a student belongs to exactly one.
  final String systemSlug;
  final String systemNameAr;

  /// 1..3 — الصف الأول/الثاني/الثالث الثانوي.
  final int year;

  /// Null when the course is not track-specific.
  final String? trackLabelAr;

  final String subjectNameAr;

  /// Null for almost every course, which is why [SubjectArtwork] exists.
  final String? coverKey;

  final int lessonCount;

  /// Total video seconds across the course.
  final int totalSeconds;

  /// مدرسة عام / مدرسة لغات. A course can serve BOTH; a student attends one.
  final bool forGeneral;
  final bool forLanguages;

  final String? emphasis;
  final String? emphasisNote;

  /// Whether every lesson it will ever have is published.
  final bool contentComplete;

  final int? monthlyPriceCents;
  final int? quarterlyPriceCents;
  final int? yearlyPriceCents;

  @override
  List<Object?> get props => [id, slug, title, year, systemSlug, trackLabelAr];
}
