import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One lesson row, as the PUBLIC catalogue reports it.
///
/// ⚠️ Carries no gate and no progress. Those are per-student and live on the
/// path payload; this half is identical for every visitor and cached for
/// hours, which is exactly why the two are fetched separately and joined on
/// the client.
@immutable
class CourseLesson extends Equatable {
  const CourseLesson({
    required this.id,
    required this.title,
    required this.kind,
    required this.estimatedSeconds,
    required this.isFreePreview,
    required this.forGeneral,
    required this.forLanguages,
    this.durationSeconds,
  });

  final String id;
  final String title;

  /// `video` | `quiz` | `attachment` | `text`.
  final String kind;

  /// The instructor's estimate, used when a lesson has no measured duration —
  /// a reading, or a video whose length has not been probed yet.
  final int estimatedSeconds;

  final bool isFreePreview;

  /// Null for anything that is not a measured video.
  final int? durationSeconds;

  /// مدرسة عام / مدرسة لغات. A lesson inside a course can serve a narrower
  /// set of schools than the course does.
  final bool forGeneral;
  final bool forLanguages;

  @override
  List<Object?> get props => [id, title, kind, durationSeconds];
}

/// A unit of the course — «الوحدة الأولى».
@immutable
class CourseSection extends Equatable {
  const CourseSection({
    required this.id,
    required this.title,
    required this.lessons,
    this.summary,
  });

  final String id;
  final String title;
  final String? summary;
  final List<CourseLesson> lessons;

  @override
  List<Object?> get props => [id, title, summary, lessons];
}

/// One purchasable term — الترم الأول / الترم الثاني.
@immutable
class CourseTerm extends Equatable {
  const CourseTerm({
    required this.id,
    required this.title,
    required this.priceCents,
  });

  final String id;
  final String title;
  final int priceCents;

  @override
  List<Object?> get props => [id, title, priceCents];
}

/// `GET /api/catalog/courses/:slug` — the course with its outline.
///
/// The same payload the marketing site reads, cached for hours and identical
/// for everyone. Everything student-specific arrives on `/me/path`.
@immutable
class CourseDetail extends Equatable {
  const CourseDetail({
    required this.id,
    required this.slug,
    required this.title,
    required this.systemNameAr,
    required this.subjectNameAr,
    required this.year,
    required this.lessonCount,
    required this.totalSeconds,
    required this.contentComplete,
    required this.sections,
    required this.terms,
    this.subtitle,
    this.trackLabelAr,
    this.coverKey,
    this.description,
    this.comingSoonNote,
    this.monthlyPriceCents,
    this.quarterlyPriceCents,
    this.yearlyPriceCents,
  });

  final String id;
  final String slug;
  final String title;
  final String? subtitle;
  final String systemNameAr;
  final String? trackLabelAr;
  final String subjectNameAr;
  final int year;
  final String? coverKey;
  final int lessonCount;
  final int totalSeconds;
  final bool contentComplete;

  /// HTML, from the admin's rich-text editor. Sanitised server-side.
  final String? description;

  /// The instructor's own «لسه هننزل قريبًا» wording for an empty course.
  /// Falls back to the stock line when they have not written one.
  final String? comingSoonNote;

  final List<CourseSection> sections;
  final List<CourseTerm> terms;

  final int? monthlyPriceCents;
  final int? quarterlyPriceCents;
  final int? yearlyPriceCents;

  /// Whether anything about this course costs money.
  ///
  /// The rule is a four-way OR and it must stay one: a course sold ONLY by
  /// term has all three plan prices null, and reading "priced" off the monthly
  /// price alone would offer it for free.
  bool get isPriced =>
      monthlyPriceCents != null ||
      quarterlyPriceCents != null ||
      yearlyPriceCents != null ||
      terms.isNotEmpty;

  /// «البكالوريا · هندسة وعلوم حاسب · البرمجة» — the line over the title.
  String get eyebrow => [
        systemNameAr,
        ?trackLabelAr,
        subjectNameAr,
      ].join(' · ');

  @override
  List<Object?> get props => [id, slug, title, sections, terms];
}
