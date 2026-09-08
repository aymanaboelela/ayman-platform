import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One past sitting.
@immutable
class AttemptHistoryRow extends Equatable {
  const AttemptHistoryRow({
    required this.id,
    required this.attemptNo,
    required this.state,
    required this.paper,
    required this.counts,
    this.submittedAt,
    this.scaledScore,
    this.passed,
  });

  final String id;
  final int attemptNo;

  /// `in_progress` | `overdue` | `submitted` | `pending_review` | `abandoned`.
  final String state;

  /// `original` | `improvement`.
  final String paper;

  /// ⚠️ Which sitting IS the grade — decided by the SERVER.
  ///
  /// Never `max()` on the client: an improvement sitting can legitimately
  /// score lower and still be the one that counts, and a client that picks the
  /// best would show a grade the transcript disagrees with.
  final bool counts;

  final DateTime? submittedAt;
  final double? scaledScore;
  final bool? passed;

  @override
  List<Object?> get props => [id, attemptNo, state, paper, counts, scaledScore];
}

/// Why a quiz cannot be started.
@immutable
class QuizBlocked extends Equatable {
  const QuizBlocked({required this.code, this.availableAt});

  /// `quiz_not_open_yet` | `quiz_closed` | `no_attempts_left`.
  final String code;

  /// The opening time, for `quiz_not_open_yet` only.
  final DateTime? availableAt;

  @override
  List<Object?> get props => [code, availableAt];
}

/// `GET /api/quiz/lessons/:lessonId` — the intro screen's whole payload.
@immutable
class QuizOverview extends Equatable {
  const QuizOverview({
    required this.quizId,
    required this.lessonId,
    required this.questionCount,
    required this.sumMarks,
    required this.gradeOutOf,
    required this.passPercent,
    required this.attemptsUsed,
    required this.allowsImprovement,
    required this.attempts,
    this.durationSeconds,
    this.nextPaper,
    this.bestScore,
    this.inProgressAttemptId,
    this.blocked,
  });

  final String quizId;
  final String lessonId;

  /// Scoped to the paper about to be sat, not to the quiz as a whole.
  final int questionCount;
  final double sumMarks;
  final double gradeOutOf;
  final double passPercent;

  /// ALL attempt rows, abandoned included.
  final int attemptsUsed;

  final bool allowsImprovement;

  /// Null when there is no timer at all — and then the attempt stays open
  /// until it is handed in.
  final int? durationSeconds;

  /// `original` | `improvement`, or null when no sitting is left OR one is
  /// already running.
  final String? nextPaper;

  /// The best scaled score across finished sittings.
  final double? bestScore;

  /// ⚠️ When this is set, [nextPaper] and [blocked] are both forced null by
  /// the server. The only offer is «كمّل».
  final String? inProgressAttemptId;

  final QuizBlocked? blocked;

  /// Newest first.
  final List<AttemptHistoryRow> attempts;

  bool get canStart =>
      inProgressAttemptId == null && blocked == null && nextPaper != null;

  bool get hasSat => attempts.any((row) => row.submittedAt != null);

  @override
  List<Object?> get props => [
    quizId,
    lessonId,
    questionCount,
    gradeOutOf,
    attemptsUsed,
    nextPaper,
    bestScore,
    inProgressAttemptId,
    blocked,
    attempts,
  ];
}
