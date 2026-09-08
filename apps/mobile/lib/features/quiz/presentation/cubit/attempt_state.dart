part of 'attempt_cubit.dart';

sealed class AttemptState extends Equatable {
  const AttemptState();

  @override
  List<Object?> get props => [];
}

final class AttemptLoading extends AttemptState {
  const AttemptLoading();
}

final class AttemptFailed extends AttemptState {
  const AttemptFailed(this.failure);

  final Failure failure;

  @override
  List<Object?> get props => [failure];
}

final class AttemptRunning extends AttemptState {
  const AttemptRunning(
    this.attempt, {
    this.index = 0,
    this.remaining,
    this.inGrace = false,
    this.saveFailed = false,
    this.submitting = false,
    this.submitFailed = false,
    this.answeredCount,
  });

  final StartedAttempt attempt;

  /// Which question is on screen.
  final int index;

  /// Null when the attempt is untimed.
  final Duration? remaining;

  /// Past the deadline, inside the grace window. Always drawn critical.
  final bool inGrace;

  /// An autosave did not land. ⚠️ Said, not thrown: a student mid-exam needs
  /// to know their answers may not be saving, and nothing else.
  final bool saveFailed;

  final bool submitting;
  final bool submitFailed;

  /// The server's count, which is the one that decides «فاضل {n} سؤال».
  final int? answeredCount;

  LearnerQuestion get current => attempt.questions[index];

  bool get isFirst => index == 0;
  bool get isLast => index >= attempt.questions.length - 1;

  AttemptRunning copyWith({
    StartedAttempt? attempt,
    int? index,
    Duration? remaining,
    bool? inGrace,
    bool? saveFailed,
    bool? submitting,
    bool? submitFailed,
    int? answeredCount,
  }) {
    return AttemptRunning(
      attempt ?? this.attempt,
      index: index ?? this.index,
      remaining: remaining ?? this.remaining,
      inGrace: inGrace ?? this.inGrace,
      saveFailed: saveFailed ?? this.saveFailed,
      submitting: submitting ?? this.submitting,
      submitFailed: submitFailed ?? this.submitFailed,
      answeredCount: answeredCount ?? this.answeredCount,
    );
  }

  @override
  List<Object?> get props => [
    attempt,
    index,
    remaining,
    inGrace,
    saveFailed,
    submitting,
    submitFailed,
    answeredCount,
  ];
}

final class AttemptSubmitted extends AttemptState {
  const AttemptSubmitted(this.result, {this.autoSubmitted = false});

  final AttemptResult result;

  /// The clock ran out rather than the student pressing anything. Worth
  /// saying: «الوقت خلص واتسلّمت» is a different fact from «اتسلّمت».
  final bool autoSubmitted;

  @override
  List<Object?> get props => [result, autoSubmitted];
}
