import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One choice on a question.
///
/// ⚠️ Carries NO `position` and NO `fraction`. The answer-leak interceptor
/// rejects any response containing either, so the order they arrive in IS the
/// order — never re-sort them.
@immutable
class QuestionOption extends Equatable {
  const QuestionOption({required this.id, required this.bodyHtml});

  final String id;

  /// HTML. Empty for a `short_answer`'s hidden patterns, which a learner
  /// never sees.
  final String bodyHtml;

  @override
  List<Object?> get props => [id, bodyHtml];
}

/// A stored answer.
///
/// Two shapes, and `null` is a third: clearing an answer sends null and makes
/// the question read as unanswered again.
@immutable
sealed class AnswerResponse extends Equatable {
  const AnswerResponse();

  Map<String, dynamic> toJson();
}

/// `{ kind: 'choice', optionIds: [...] }` — every choice type, and ordering.
@immutable
class ChoiceAnswer extends AnswerResponse {
  const ChoiceAnswer(this.optionIds);

  final List<String> optionIds;

  @override
  Map<String, dynamic> toJson() => {'kind': 'choice', 'optionIds': optionIds};

  @override
  List<Object?> get props => [optionIds];
}

/// `{ kind: 'text', text: '…' }` — short answer and essay.
@immutable
class TextAnswer extends AnswerResponse {
  const TextAnswer(this.text);

  final String text;

  @override
  Map<String, dynamic> toJson() => {'kind': 'text', 'text': text};

  @override
  List<Object?> get props => [text];
}

/// One question on the paper, as the learner may see it.
@immutable
class LearnerQuestion extends Equatable {
  const LearnerQuestion({
    required this.slotPosition,
    required this.questionId,
    required this.type,
    required this.stemHtml,
    required this.maxMark,
    required this.options,
    required this.flagged,
    required this.answered,
    this.response,
    this.minWords,
    this.maxWords,
  });

  /// ⚠️ `slotPosition`, NOT `position` — the leak guard rejects the latter as
  /// a forbidden key, so the server will never send it on this route.
  final int slotPosition;

  /// The QuestionVersion id.
  final String questionId;

  /// `mcq_single` | `true_false` | `mcq_multi` | `short_answer` | `essay` |
  /// `ordering`.
  final String type;

  final String stemHtml;
  final double maxMark;

  /// In SNAPSHOTTED order. Never re-sorted.
  final List<QuestionOption> options;

  final AnswerResponse? response;
  final bool flagged;

  /// A projection of the grading state — never the grading state itself.
  final bool answered;

  /// Informational ONLY. Nothing enforces them, client or server.
  final int? minWords;
  final int? maxWords;

  bool get isChoice =>
      type == 'mcq_single' || type == 'true_false' || type == 'mcq_multi';
  bool get isText => type == 'short_answer' || type == 'essay';
  bool get isOrdering => type == 'ordering';
  bool get isMulti => type == 'mcq_multi';

  /// The ids currently chosen, in stored order.
  List<String> get chosenIds =>
      response is ChoiceAnswer ? (response! as ChoiceAnswer).optionIds : const [];

  String get text => response is TextAnswer ? (response! as TextAnswer).text : '';

  LearnerQuestion copyWith({
    AnswerResponse? response,
    bool clearResponse = false,
    bool? flagged,
    bool? answered,
  }) {
    return LearnerQuestion(
      slotPosition: slotPosition,
      questionId: questionId,
      type: type,
      stemHtml: stemHtml,
      maxMark: maxMark,
      options: options,
      response: clearResponse ? null : (response ?? this.response),
      flagged: flagged ?? this.flagged,
      answered: answered ?? this.answered,
      minWords: minWords,
      maxWords: maxWords,
    );
  }

  @override
  List<Object?> get props => [
    slotPosition,
    questionId,
    type,
    response,
    flagged,
    answered,
  ];
}

/// A running attempt.
@immutable
class StartedAttempt extends Equatable {
  const StartedAttempt({
    required this.attemptId,
    required this.attemptToken,
    required this.serverTime,
    required this.status,
    required this.navMethod,
    required this.paper,
    required this.gradeOutOf,
    required this.sumMarks,
    required this.nextSeq,
    required this.graceSeconds,
    required this.overdueHandling,
    required this.questions,
    this.deadlineAt,
  });

  final String attemptId;

  /// ⚠️ REQUIRED on every subsequent write. A save without it is refused.
  final String attemptToken;

  /// Computed ONCE at start and never recomputed — not by an instructor
  /// editing the duration, not on resume. Null means no timer at all.
  final DateTime? deadlineAt;

  /// The clock ANCHOR. Every response a running client sees carries a fresh
  /// one, and the countdown re-anchors on each.
  final DateTime serverTime;

  /// The literal `in_progress`. ⚠️ `status`, not `state` — the leak guard
  /// forbids the latter as a key.
  final String status;

  /// `free` | `sequential`.
  final String navMethod;

  /// `original` | `improvement`.
  final String paper;

  final double gradeOutOf;

  /// The ATTEMPT's snapshot, not the quiz's live value.
  final double sumMarks;

  /// The lowest `seq` this client may safely send.
  ///
  /// It exists because `responseSeq` is deliberately not exposed per question,
  /// so a freshly launched client has no other way to avoid losing the
  /// `responseSeq < seq` race against an already-higher stored value.
  final int nextSeq;

  final int graceSeconds;

  /// `autosubmit` | `graceperiod` | `autoabandon`.
  final String overdueHandling;

  /// Ordered by `slotPosition` ascending.
  final List<LearnerQuestion> questions;

  bool get isSequential => navMethod == 'sequential';
  bool get isTimed => deadlineAt != null;

  int get answeredCount => questions.where((q) => q.answered).length;

  StartedAttempt copyWith({
    DateTime? serverTime,
    DateTime? deadlineAt,
    int? nextSeq,
    List<LearnerQuestion>? questions,
  }) {
    return StartedAttempt(
      attemptId: attemptId,
      attemptToken: attemptToken,
      deadlineAt: deadlineAt ?? this.deadlineAt,
      serverTime: serverTime ?? this.serverTime,
      status: status,
      navMethod: navMethod,
      paper: paper,
      gradeOutOf: gradeOutOf,
      sumMarks: sumMarks,
      nextSeq: nextSeq ?? this.nextSeq,
      graceSeconds: graceSeconds,
      overdueHandling: overdueHandling,
      questions: questions ?? this.questions,
    );
  }

  @override
  List<Object?> get props => [
    attemptId,
    attemptToken,
    deadlineAt,
    serverTime,
    navMethod,
    nextSeq,
    questions,
  ];
}

/// What a save answered with. ⚠️ `serverTime` RE-ANCHORS the countdown.
@immutable
class SaveResult extends Equatable {
  const SaveResult({
    required this.savedSlots,
    required this.serverTime,
    required this.answeredCount,
    this.deadlineAt,
  });

  /// Only the slots whose UPDATE actually matched. A slot whose stored
  /// `responseSeq >= seq` is silently skipped, which is how a late write from
  /// a slow connection is prevented from overwriting a newer answer.
  final List<int> savedSlots;

  final DateTime serverTime;
  final DateTime? deadlineAt;
  final int answeredCount;

  @override
  List<Object?> get props => [savedSlots, serverTime, deadlineAt, answeredCount];
}

/// The score, the moment it is earned.
@immutable
class AttemptResult extends Equatable {
  const AttemptResult({
    required this.attemptId,
    required this.rawScore,
    required this.scaledScore,
    required this.passed,
    required this.needsGrading,
    required this.attemptState,
  });

  final String attemptId;
  final double rawScore;
  final double scaledScore;
  final bool passed;

  /// An essay is on the paper — the mark is not final yet.
  final bool needsGrading;

  /// `submitted` | `pending_review`.
  final String attemptState;

  @override
  List<Object?> get props => [
    attemptId,
    rawScore,
    scaledScore,
    passed,
    needsGrading,
    attemptState,
  ];
}
