import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/data/progress/progress_constants.dart';
import '../../domain/entities/lesson_player.dart';
import '../../domain/entities/lesson_progress.dart';
import '../../domain/repositories/player_repository.dart';

part 'player_state.dart';

/// Owns one lesson screen, and the progress protocol behind it.
///
/// ## Everything progress-related lives HERE
///
/// The video widget reports playback, the dwell timer reports elapsed time and
/// the finish button reports a press — but only this cubit talks to the server
/// about any of it. Two writers on one row is how a manual completion gets
/// overwritten by a late heartbeat.
class PlayerCubit extends Cubit<PlayerState> {
  PlayerCubit(this._repository, this.lessonId)
      : super(const PlayerLoading());

  final PlayerRepository _repository;
  final String lessonId;

  Timer? _dwellTimer;

  Future<void> load() async {
    if (state is! PlayerReady) emit(const PlayerLoading());

    final result = await _repository.load(lessonId);
    result.fold(
      (failure) => emit(PlayerFailed(failure)),
      (player) {
        emit(PlayerReady(player));

        // ⚠️ AFTER the state is emitted, and never awaited before the first
        // frame. `open` writes `lastLessonId` — it is what brings the student
        // back here — but it is bookkeeping, and a lecture must not wait on a
        // POST to appear.
        unawaited(_repository.open(lessonId));

        if (player.lesson.isDwell && !player.progress.isComplete) {
          _startDwell();
        }
      },
    );
  }

  /// One flush from the heartbeat engine.
  ///
  /// ⚠️ The RESULT is authoritative. The client predicts nothing: whatever
  /// comes back replaces the local progress, including the completion the
  /// server decided on this very request.
  Future<void> onHeartbeat({required int position, required int delta}) async {
    final current = state;
    if (current is! PlayerReady) return;

    final result = await _repository.heartbeat(
      lessonId,
      position: position,
      delta: delta,
    );

    result.fold(
      // A failed heartbeat is SAID, not thrown: «مقدرناش نسجّل تقدّمك دلوقتي»
      // under the video. The engine keeps the seconds and retries; the student
      // needs to know their watching may not be counting, and nothing else.
      (_) => emit(current.copyWith(saveFailed: true)),
      (heartbeat) => emit(
        current.copyWith(
          progress: heartbeat.progress,
          courseProgressPercent: heartbeat.courseProgressPercent,
          justCompleted: heartbeat.justCompleted,
          saveFailed: false,
        ),
      ),
    );
  }

  /// «خلاص · التالي».
  ///
  /// Answers true only when the write landed. ⚠️ A caller must NOT navigate on
  /// false: advancing after a failed write is what makes the gap invisible —
  /// the student ends up further along with a hole they find weeks later when
  /// the course will not reach 100%.
  Future<bool> complete() async {
    final current = state;
    if (current is! PlayerReady || current.completing) return false;

    emit(current.copyWith(completing: true, clearCompleteError: true));
    final result = await _repository.complete(lessonId);

    return result.fold(
      (failure) {
        emit(current.copyWith(completing: false, completeFailed: true));
        return false;
      },
      (heartbeat) {
        emit(
          current.copyWith(
            progress: heartbeat.progress,
            courseProgressPercent: heartbeat.courseProgressPercent,
            justCompleted: heartbeat.justCompleted,
            completing: false,
            clearCompleteError: true,
          ),
        );
        return true;
      },
    );
  }

  /// The text/attachment dwell timer.
  ///
  /// Five seconds, then ask. If the answer still says «not complete», wait
  /// another five and ask again — the server measures from its own
  /// `firstOpenedAt`, so asking early is harmless and asking often cannot make
  /// it happen faster.
  ///
  /// Failures are SILENT: the manual button is always there, and a toast about
  /// a background timer on a reading page is noise.
  void _startDwell() {
    _dwellTimer?.cancel();
    _dwellTimer = Timer(ProgressConstants.dwellComplete, () async {
      final current = state;
      if (current is! PlayerReady || isClosed) return;

      final result = await _repository.dwell(lessonId);
      if (isClosed) return;

      result.fold((_) {}, (heartbeat) {
        final latest = state;
        if (latest is! PlayerReady) return;
        emit(
          latest.copyWith(
            progress: heartbeat.progress,
            courseProgressPercent: heartbeat.courseProgressPercent,
            justCompleted: heartbeat.justCompleted,
          ),
        );
        if (!heartbeat.progress.isComplete) _startDwell();
      });
    });
  }

  /// The mirror reported a FATAL error — fall through to YouTube from the
  /// same second.
  ///
  /// One way only: a source that failed once must not be tried again on the
  /// next rebuild, or a broken mirror becomes a flicker between two players.
  void onMirrorFailed() {
    final current = state;
    if (current is! PlayerReady || current.mirrorFailed) return;
    emit(current.copyWith(mirrorFailed: true));
  }

  /// The student pressed play. Until then the poster is showing and nothing
  /// has been fetched — a course page with six lectures must not open six
  /// video connections.
  void onActivated() {
    final current = state;
    if (current is! PlayerReady || current.activated) return;
    emit(current.copyWith(activated: true));
  }

  /// «من الأول» — restart rather than resume.
  void onRestart() {
    final current = state;
    if (current is! PlayerReady) return;
    emit(current.copyWith(activated: true, restart: true));
  }

  /// The homework card handed something in.
  void onHomeworkSubmitted(HomeworkSubmission submission) {
    final current = state;
    if (current is! PlayerReady) return;
    final homework = current.player.homework;
    if (homework == null) return;

    emit(
      current.copyWith(
        player: LessonPlayer(
          lesson: current.player.lesson,
          progress: current.progress,
          resources: current.player.resources,
          autoCompleteAvailable: current.player.autoCompleteAvailable,
          video: current.player.video,
          textHtml: current.player.textHtml,
          homework: PlayerHomework(
            body: homework.body,
            maxImages: homework.maxImages,
            submission: submission,
          ),
          quizId: current.player.quizId,
          previous: current.player.previous,
          next: current.player.next,
        ),
      ),
    );
  }

  @override
  Future<void> close() {
    _dwellTimer?.cancel();
    return super.close();
  }
}
