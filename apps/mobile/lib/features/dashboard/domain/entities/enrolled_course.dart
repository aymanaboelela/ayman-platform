import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One course the student is enrolled in, as `GET /api/me/dashboard` reports
/// it.
@immutable
class EnrolledCourse extends Equatable {
  const EnrolledCourse({
    required this.id,
    required this.slug,
    required this.title,
    required this.subjectNameAr,
    required this.published,
    required this.progressPercent,
    required this.completedLessons,
    required this.totalLessons,
    required this.contentComplete,
    this.coverKey,
    this.whatsappGroupUrl,
    this.lastLessonId,
    this.subscriptionValidUntil,
    this.comingSoonNote,
    this.bookTitle,
    this.bookPriceCents,
    this.scheduleNote,
  });

  final String id;
  final String slug;
  final String title;

  /// The storage KEY, never a URL — the same rule `media_assets` follows. The
  /// client turns it into one; a null key is the NORMAL case, not a gap, and
  /// is what [SubjectArtwork] exists to fill.
  final String? coverKey;

  /// Labels the coverless fallback, and seeds its generated hue.
  final String subjectNameAr;

  /// «جروب الدفعة» for THIS course's cohort.
  ///
  /// Null for most courses and that is the steady state, not a gap — «أوقات
  /// برضه ممكن أنا ما أعملش جروب أصلاً». The card renders nothing rather than
  /// falling back to the platform-wide channel, which would put every course's
  /// students in one room.
  final String? whatsappGroupUrl;

  /// False while a course is still being prepared. An unpublished course is
  /// shown, dimmed and unopenable, rather than hidden — the student paid for
  /// it and needs to see it is coming.
  final bool published;

  /// ⚠️ Reported by the server and OBSERVED STALE.
  ///
  /// `dashboard-view.ts` deliberately does not use this to decide whether a
  /// course is finished; it compares `completedLessons >= totalLessons`
  /// instead. Use it for the progress bar, never for a completion test.
  final double progressPercent;

  final int completedLessons;
  final int totalLessons;

  /// Where to resume. Null means the student has never opened a lesson.
  final String? lastLessonId;

  final DateTime? subscriptionValidUntil;
  final String? comingSoonNote;

  /// Whether every lesson the course will ever have is already published.
  final bool contentComplete;

  /// ⚠️ NOT a book's name — it is CTA COPY.
  ///
  /// `courses.book_title` holds a sentence like «الكتاب متاح دلوقتي», and
  /// treating it as a title once published a sentence as a book name. Render
  /// it as the label it is.
  final String? bookTitle;

  final int? bookPriceCents;
  final String? scheduleNote;

  /// The completion test the product actually uses.
  ///
  /// `totalLessons > 0` guards a course with no content yet, which would
  /// otherwise satisfy `0 >= 0` and report itself finished.
  bool get isComplete => totalLessons > 0 && completedLessons >= totalLessons;

  /// Whether the student can open it at all.
  bool get isOpenable => published;

  @override
  List<Object?> get props => [
    id,
    slug,
    title,
    coverKey,
    subjectNameAr,
    whatsappGroupUrl,
    published,
    progressPercent,
    completedLessons,
    totalLessons,
    lastLessonId,
    subscriptionValidUntil,
    comingSoonNote,
    contentComplete,
    bookTitle,
    bookPriceCents,
    scheduleNote,
  ];
}
