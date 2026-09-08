import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/services/quiz/attempt_autosave.dart';
import '../../../../core/services/quiz/attempt_clock.dart';
import '../../domain/entities/attempt.dart';
import '../../domain/repositories/quiz_repository.dart';

part 'attempt_state.dart';

/// Owns one sitting: the paper, the clock, the autosave and the hand-in.
///
/// ## Everything that writes goes through HERE
///
/// One `seq` counter, one clock anchor, one submit latch. A second writer — a
/// question widget saving for itself, say — is how an out-of-order write
/// silently loses an answer the student typed.
class AttemptCubit extends Cubit<AttemptState> {
  AttemptCubit(this._repository) : super(const AttemptLoading());

  final QuizRepository _repository;

  AttemptAutosave? _autosave;
  AttemptClock? _clock;
  StreamSubscription<Duration>? _ticks;

  /// ⚠️ Latched. A submit fired twice is a 409 in the middle of an exam.
  bool _submitting = false;

  /// Starts a new sitting, or picks up the one already running.
  ///
  /// ⚠️ Takes the LESSON id and resolves the quiz from it.
  ///
  /// `POST /quiz/quizzes/:quizId/attempts` wants the QUIZ id, and the route
  /// that gets here only carries the lesson — a quiz has no URL of its own on
  /// this platform, because a student navigates to a LESSON that happens to be
  /// an exam. Passing the lesson id straight through fails the whole start
  /// with a generic error, which is exactly what shipped first.
  ///
  /// The overview read also settles a second question for free: if a sitting
  /// is already running, this RESUMES it rather than starting a new one and
  /// spending an attempt the student is already inside.
  Future<void> begin({required String lessonId, String? resumeAttemptId}) async {
    emit(const AttemptLoading());

    if (resumeAttemptId != null) {
      final resumed = await _repository.resume(resumeAttemptId);
      resumed.fold(
        (failure) => emit(AttemptFailed(failure)),
        (attempt) {
          emit(AttemptRunning(attempt));
          _wire(attempt);
        },
      );
      return;
    }

    final overview = await _repository.overview(lessonId);
    final resolved = overview.fold((failure) => failure, (_) => null);
    if (resolved != null) {
      emit(AttemptFailed(resolved));
      return;
    }

    final quiz = overview.getOrElse(() => throw StateError('unreachable'));

    // Already sitting it. Resume rather than start — the server forces
    // `nextPaper` to null in this state and a start would be refused anyway.
    final running = quiz.inProgressAttemptId;
    final result = running != null
        ? await _repository.resume(running)
        : await _repository.start(quiz.quizId);

    result.fold(
      (failure) => emit(AttemptFailed(failure)),
      (attempt) {
        emit(AttemptRunning(attempt));
        _wire(attempt);
      },
    );
  }

  void _wire(StartedAttempt attempt) {
    _autosave?.dispose();
    _autosave = AttemptAutosave(
      // Seeded from the SERVER's `nextSeq`: a freshly launched client has no
      // other way to avoid losing the `responseSeq < seq` race against a value
      // an earlier session already stored.
      nextSeq: attempt.nextSeq,
      onSave: (seq, answers) => _save(seq, answers),
    );

    _ticks?.cancel();
    _clock?.dispose();
    _clock = null;

    final deadline = attempt.deadlineAt;
    // No duration means no deadline means no timer at all, and the sweeper
    // never picks the attempt up either — it stays open until it is handed in.
    if (deadline == null) return;

    final clock = AttemptClock(
      serverTime: attempt.serverTime,
      deadline: deadline,
      graceSeconds: attempt.graceSeconds,
      usesGracePeriod: attempt.overdueHandling == 'graceperiod',
      onTimeUp: () => unawaited(submit(auto: true)),
    );
    _clock = clock;
    _ticks = clock.ticks.listen((remaining) {
      final current = state;
      if (current is! AttemptRunning || isClosed) return;
      emit(current.copyWith(remaining: remaining, inGrace: clock.isInGrace));
    });
    clock.start();
  }

  Future<SaveResult?> _save(int seq, Map<int, AnswerResponse?> answers) async {
    final current = state;
    if (current is! AttemptRunning) return null;

    final result = await _repository.saveAnswers(
      current.attempt.attemptId,
      attemptToken: current.attempt.attemptToken,
      seq: seq,
      answers: answers,
    );

    return result.fold(
      (failure) {
        if (!isClosed) {
          final latest = state;
          if (latest is AttemptRunning) {
            emit(latest.copyWith(saveFailed: true));
          }
        }
        return null;
      },
      (saved) {
        if (isClosed) return saved;
        final latest = state;
        if (latest is AttemptRunning) {
          // ⚠️ RE-ANCHOR on every save. Drift between the device's stopwatch
          // and the server accumulates over a long paper, and this is the only
          // correction there is.
          _clock?.reanchor(
            serverTime: saved.serverTime,
            deadline: saved.deadlineAt,
          );
          emit(latest.copyWith(saveFailed: false, answeredCount: saved.answeredCount));
        }
        return saved;
      },
    );
  }

  /// Records an answer locally and queues it.
  void answer(int slotPosition, AnswerResponse? response) {
    final current = state;
    if (current is! AttemptRunning) return;

    emit(
      current.copyWith(
        attempt: current.attempt.copyWith(
          questions: [
            for (final question in current.attempt.questions)
              if (question.slotPosition == slotPosition)
                question.copyWith(
                  response: response,
                  clearResponse: response == null,
                  // «مسح إجابتي» makes the question read as unanswered again —
                  // which is exactly what the student meant by clearing it.
                  answered: response != null,
                )
              else
                question,
          ],
        ),
      ),
    );

    _autosave?.queue(slotPosition, response);
  }

  /// Leaving a question flushes it. A pending answer that never goes is a mark
  /// the student earned and does not get.
  Future<void> flush() => _autosave?.flushNow() ?? Future.value();

  /// ⚠️ Flags do NOT ride the answer autosave — the save schema has no field
  /// for them, and the web lost every flag on reload for months because of it.
  Future<void> toggleFlag(int slotPosition) async {
    final current = state;
    if (current is! AttemptRunning) return;

    final question = current.attempt.questions
        .firstWhere((q) => q.slotPosition == slotPosition);
    final next = !question.flagged;

    // Optimistic: a flag is a bookmark, and waiting a round trip to draw it
    // makes the control feel broken.
    emit(
      current.copyWith(
        attempt: current.attempt.copyWith(
          questions: [
            for (final q in current.attempt.questions)
              if (q.slotPosition == slotPosition) q.copyWith(flagged: next) else q,
          ],
        ),
      ),
    );

    await _repository.flag(
      current.attempt.attemptId,
      attemptToken: current.attempt.attemptToken,
      slotPosition: slotPosition,
      flagged: next,
    );
  }

  void goTo(int index) {
    final current = state;
    if (current is! AttemptRunning) return;
    if (index < 0 || index >= current.attempt.questions.length) return;
    emit(current.copyWith(index: index));
  }

  /// How many are still blank, straight from the server.
  Future<({int unansweredCount, int total})?> preflight() async {
    final current = state;
    if (current is! AttemptRunning) return null;
    await flush();
    final result = await _repository.preflight(current.attempt.attemptId);
    return result.fold((_) => null, (counts) => counts);
  }

  /// Hands the paper in.
  ///
  /// ⚠️ Flushes FIRST, always. The last answer a student types is the one most
  /// likely to be in flight when they press submit.
  Future<void> submit({bool auto = false}) async {
    final current = state;
    if (current is! AttemptRunning || _submitting) return;
    _submitting = true;

    emit(current.copyWith(submitting: true));
    await flush();

    final result = await _repository.submit(
      current.attempt.attemptId,
      attemptToken: current.attempt.attemptToken,
    );

    if (isClosed) return;
    result.fold(
      (failure) {
        _submitting = false;
        final latest = state;
        if (latest is AttemptRunning) {
          emit(latest.copyWith(submitting: false, submitFailed: true));
        }
      },
      (outcome) {
        _clock?.dispose();
        _clock = null;
        emit(AttemptSubmitted(outcome, autoSubmitted: auto));
      },
    );
  }

  @override
  Future<void> close() {
    _ticks?.cancel();
    _clock?.dispose();
    _autosave?.dispose();
    return super.close();
  }
}
