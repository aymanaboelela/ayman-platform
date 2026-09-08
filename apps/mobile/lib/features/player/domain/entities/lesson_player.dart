import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import '../../../../core/data/progress/progress_constants.dart';
import 'lesson_progress.dart';

/// Which lesson this is, and where it sits.
@immutable
class PlayerLesson extends Equatable {
  const PlayerLesson({
    required this.id,
    required this.courseId,
    required this.courseSlug,
    required this.courseTitle,
    required this.sectionTitle,
    required this.title,
    required this.kind,
    this.estimatedSeconds,
  });

  final String id;
  final String courseId;
  final String courseSlug;
  final String courseTitle;
  final String sectionTitle;
  final String title;

  /// `video` | `quiz` | `attachment` | `text`.
  final String kind;

  final int? estimatedSeconds;

  bool get isVideo => kind == 'video';
  bool get isQuiz => kind == 'quiz';

  /// The two kinds that complete by sitting on screen.
  bool get isDwell => kind == 'text' || kind == 'attachment';

  @override
  List<Object?> get props => [id, courseSlug, title, kind];
}

/// Our own copy of the lecture, on R2.
///
/// ⚠️ This is the PRIMARY source, not a fallback — see [PlayerVideo].
@immutable
class VideoMirror extends Equatable {
  const VideoMirror({required this.hlsUrl, required this.maxHeight});

  final String hlsUrl;

  /// The tallest rung the mirror actually produced.
  ///
  /// It exists so the UI can say «جودة عالية» honestly: a mirror that only
  /// managed 480p because that is all YouTube had must not be announced as
  /// 1080p.
  final int maxHeight;

  @override
  List<Object?> get props => [hlsUrl, maxHeight];
}

/// The video on a lecture.
@immutable
class PlayerVideo extends Equatable {
  const PlayerVideo({
    required this.youtubeId,
    required this.durationSeconds,
    this.posterUrl,
    this.mirror,
  });

  /// Exactly 11 characters of `[A-Za-z0-9_-]`.
  final String youtubeId;

  /// 0 when unknown — and an unknown duration means the lesson can never
  /// auto-complete, only be finished by hand.
  final int durationSeconds;

  /// ABSOLUTE, unlike every `coverKey` elsewhere: the server resolves it,
  /// falling back to YouTube's own thumbnail.
  final String? posterUrl;

  /// Null unless the mirror finished. See [prefersMirror].
  final VideoMirror? mirror;

  /// ⚠️ MIRROR FIRST, YouTube second — and the order is the entire feature.
  ///
  /// YouTube-first with the mirror as a fallback still leaves every
  /// ministry-tablet student staring at a dead frame, because a fallback only
  /// runs after something REPORTS a failure and a blocked network reports
  /// nothing at all. It just hangs.
  bool get prefersMirror => mirror != null;

  @override
  List<Object?> get props => [youtubeId, durationSeconds, posterUrl, mirror];
}

/// A file or a link attached to the lesson.
@immutable
class PlayerResource extends Equatable {
  const PlayerResource({
    required this.id,
    required this.kind,
    required this.title,
    this.description,
    this.filename,
    this.mime,
    this.sizeBytes,
    this.youtubeId,
    this.linkUrl,
    this.viewPath,
    this.downloadPath,
  });

  final String id;

  /// `presentation` | `video` | `document` | `link`.
  final String kind;

  final String title;
  final String? description;

  /// ⚠️ NEVER shown. Multer decodes the multipart filename as latin1, so an
  /// Arabic upload comes back as «Ø£Ø³Ø§Ø³ÙØ§Øª…». The instructor's [title] is
  /// what a student reads.
  final String? filename;

  final String? mime;
  final int? sizeBytes;
  final String? youtubeId;
  final String? linkUrl;

  /// RELATIVE same-origin API paths, non-null only for `presentation` and
  /// `document`.
  ///
  /// ⚠️ Deliberately not storage URLs: `/media/*` is public and can never
  /// carry enrolment-gated content, so these routes re-derive access per
  /// request before streaming a byte.
  final String? viewPath;
  final String? downloadPath;

  bool get isFile => viewPath != null;

  @override
  List<Object?> get props => [id, kind, title, viewPath, linkUrl, youtubeId];
}

/// الواجب on this lecture.
@immutable
class PlayerHomework extends Equatable {
  const PlayerHomework({
    required this.body,
    required this.maxImages,
    this.submission,
  });

  /// PLAIN TEXT with newlines — rendered with the breaks preserved and never
  /// as markup.
  final String body;

  final int maxImages;

  /// The student's own submission, or null when nothing is handed in.
  final HomeworkSubmission? submission;

  @override
  List<Object?> get props => [body, maxImages, submission];
}

/// What the student handed in, and what came back.
@immutable
class HomeworkSubmission extends Equatable {
  const HomeworkSubmission({
    required this.id,
    required this.status,
    required this.attempt,
    required this.imageCount,
    required this.imageIds,
    required this.imagesPurged,
    this.reviewNote,
    this.grade,
    this.submittedAt,
    this.reviewedAt,
  });

  final String id;

  /// `submitted` | `accepted` | `needs_work`.
  ///
  /// ⚠️ `submitted`, not `pending` — the wire value is what the API sends and
  /// a chip keyed on the wrong string silently renders the fallback state.
  final String status;

  final int attempt;

  /// How many pages were handed in.
  ///
  /// ⚠️ SURVIVES the purge, and that is the whole reason it exists next to
  /// [imageIds]: «ما تبينوش إنها اتمسحت». A student returning in November
  /// reads «سلّمت ٣ صور · مقبول» with the mark and the note intact, rather
  /// than an empty card that looks like the platform lost their work.
  final int imageCount;

  /// Ids only — EMPTY once the pages have been swept. Each is fetched from
  /// `/api/homework/images/:id` WITH THE SESSION; the response is
  /// `private, no-store` and must never reach a CDN-backed image cache.
  final List<String> imageIds;

  /// The pages are gone. Thirty days after an un-accepted submission, or
  /// straight after an acceptance.
  final bool imagesPurged;

  /// أيمن's own words. Newlines preserved, never markup.
  final String? reviewNote;

  /// 0..100, or null.
  final int? grade;

  final DateTime? submittedAt;
  final DateTime? reviewedAt;

  bool get isPending => status == 'submitted';
  bool get isAccepted => status == 'accepted';
  bool get needsWork => status == 'needs_work';

  /// Whether a NEW submission is allowed.
  ///
  /// An accepted one is final — the API refuses a resubmission — and a pending
  /// one must not be replaced either: أيمن may already be looking at the pages.
  bool get canResubmit => needsWork;

  @override
  List<Object?> get props => [
    id,
    status,
    attempt,
    imageCount,
    imageIds,
    imagesPurged,
    reviewNote,
    grade,
  ];
}

/// The previous or next lesson in reading order.
@immutable
class LessonNeighbour extends Equatable {
  const LessonNeighbour({
    required this.id,
    required this.title,
    required this.kind,
  });

  final String id;
  final String title;
  final String kind;

  @override
  List<Object?> get props => [id, title, kind];
}

/// `GET /api/lessons/:lessonId/player` — everything one lesson screen needs.
@immutable
class LessonPlayer extends Equatable {
  const LessonPlayer({
    required this.lesson,
    required this.progress,
    required this.resources,
    required this.autoCompleteAvailable,
    this.video,
    this.textHtml,
    this.homework,
    this.quizId,
    this.previous,
    this.next,
  });

  final PlayerLesson lesson;
  final LessonProgress progress;
  final List<PlayerResource> resources;

  /// Null for every non-video lesson AND for a video lesson with no video row
  /// — a real state the screen has to draw, not an error.
  final PlayerVideo? video;

  /// Sanitised HTML, for a `text` lesson.
  final String? textHtml;

  final PlayerHomework? homework;

  /// A PUBLISHED quiz on this lesson, or null.
  final String? quizId;

  final LessonNeighbour? previous;
  final LessonNeighbour? next;

  /// "Will this lesson tick itself off?"
  ///
  /// `kind == 'quiz' || (kind == 'video' && durationSeconds > 0)`. It picks
  /// between the three completion hints and hides the manual button on a quiz.
  final bool autoCompleteAvailable;

  /// Where playback should start — through the SHARED rule, so the player
  /// and anything else that resumes cannot disagree about it.
  int get resumeSeconds => ProgressConstants.resumePoint(
        maxPositionSeconds: progress.maxPositionSeconds,
        durationSeconds: video?.durationSeconds ?? 0,
        isComplete: progress.isComplete,
      );

  @override
  List<Object?> get props => [
    lesson,
    progress,
    video,
    textHtml,
    homework,
    quizId,
    resources,
    previous,
    next,
    autoCompleteAvailable,
  ];
}
