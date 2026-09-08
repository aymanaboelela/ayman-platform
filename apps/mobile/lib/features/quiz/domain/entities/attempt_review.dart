import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import 'attempt.dart';

/// One question, as the review screen may show it.
///
/// ## ⚠️ OMISSION is the control, not null
///
/// The server builds this by ADDING permitted fields to a base object, and
/// «a key whose value is null is itself information». A mark of `null` on a
/// question that WAS graded says something; the absence of the key says the
/// student is not allowed to see marks at all.
///
/// So every gated field below carries a `has…` flag taken from
/// `containsKey`, and the UI branches on THAT — never on `!= null`.
@immutable
class ReviewQuestion extends Equatable {
  const ReviewQuestion({
    required this.slotPosition,
    required this.questionId,
    required this.attemptQuestionId,
    required this.type,
    required this.stemHtml,
    required this.options,
    required this.hasResponse,
    required this.hasCorrectness,
    required this.hasMarks,
    this.response,
    this.correctness,
    this.mark,
    this.maxMark,
    this.feedbackHtml,
    this.generalFeedbackHtml,
    this.rightAnswerText,
    this.rightAnswerOptionIds,
  });

  final int slotPosition;
  final String questionId;
  final String attemptQuestionId;
  final String type;
  final String stemHtml;

  /// The snapshotted order, replayed.
  final List<QuestionOption> options;

  /// Whether the student may see what they answered at all.
  final bool hasResponse;
  final AnswerResponse? response;

  /// Whether the verdict is shown.
  final bool hasCorrectness;

  /// `correct` | `partial` | `incorrect` | `needsGrading` | `unanswered`.
  final String? correctness;

  /// Whether marks are shown. ⚠️ A visible `null` mark means «لسه بتتصحّح»,
  /// which is why the flag and the value are separate.
  final bool hasMarks;
  final double? mark;
  final double? maxMark;

  /// Per-question feedback, when the instructor wrote any AND it is permitted.
  final String? feedbackHtml;
  final String? generalFeedbackHtml;

  /// The model answer, when permitted.
  final String? rightAnswerText;
  final List<String>? rightAnswerOptionIds;

  List<String> get chosenIds =>
      response is ChoiceAnswer ? (response! as ChoiceAnswer).optionIds : const [];

  String get text => response is TextAnswer ? (response! as TextAnswer).text : '';

  @override
  List<Object?> get props => [
    slotPosition,
    questionId,
    type,
    hasResponse,
    hasCorrectness,
    hasMarks,
    correctness,
    mark,
  ];
}

/// `GET /api/quiz/attempts/:id/review`.
///
/// Two shapes: locked, or the paper. Locked is not an error — it is the
/// instructor's setting, and «لسه بدري» is a different sentence from «حصل خطأ».
@immutable
sealed class ReviewPayload extends Equatable {
  const ReviewPayload();
}

/// Review is not open yet.
@immutable
class ReviewLocked extends ReviewPayload {
  const ReviewLocked(this.reason);

  /// `during` — the attempt is still running.
  /// `awaitingClose` — the instructor releases answers only after the window
  /// shuts, so nobody can pass them round mid-exam.
  final String reason;

  @override
  List<Object?> get props => [reason];
}

@immutable
class ReviewUnlocked extends ReviewPayload {
  const ReviewUnlocked({
    required this.attemptId,
    required this.window,
    required this.gradeOutOf,
    required this.sumMarks,
    required this.passPercent,
    required this.questions,
    this.rawScore,
    this.scaledScore,
    this.passed,
  });

  final String attemptId;

  /// `during` | `immediatelyAfter` | `laterWhileOpen` | `afterClose`.
  final String window;

  final double? rawScore;
  final double? scaledScore;
  final double gradeOutOf;
  final double sumMarks;
  final double passPercent;
  final bool? passed;

  final List<ReviewQuestion> questions;

  @override
  List<Object?> get props => [
    attemptId,
    window,
    rawScore,
    scaledScore,
    passed,
    questions,
  ];
}
