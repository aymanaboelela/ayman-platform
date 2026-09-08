part of 'player_cubit.dart';

sealed class PlayerState extends Equatable {
  const PlayerState();

  @override
  List<Object?> get props => [];
}

final class PlayerLoading extends PlayerState {
  const PlayerLoading();
}

final class PlayerFailed extends PlayerState {
  const PlayerFailed(this.failure);

  final Failure failure;

  @override
  List<Object?> get props => [failure];
}

final class PlayerReady extends PlayerState {
  const PlayerReady(
    this.player, {
    LessonProgress? progress,
    this.courseProgressPercent,
    this.justCompleted = false,
    this.saveFailed = false,
    this.completing = false,
    this.completeFailed = false,
    this.mirrorFailed = false,
    this.activated = false,
    this.restart = false,
  }) : _progress = progress;

  final LessonPlayer player;

  /// The LIVE progress, which the payload's own copy only seeds. Every
  /// heartbeat replaces it with what the server returned.
  final LessonProgress? _progress;

  LessonProgress get progress => _progress ?? player.progress;

  /// Recomputed by the server on a transition only; null until one arrives.
  final double? courseProgressPercent;

  /// True for exactly one emission — the response that crossed the line.
  final bool justCompleted;

  /// A heartbeat did not land. «مقدرناش نسجّل تقدّمك دلوقتي».
  final bool saveFailed;

  final bool completing;

  /// The finish button failed. ⚠️ The caller must not navigate.
  final bool completeFailed;

  /// The mirror failed FATALLY and the YouTube path has taken over. One way
  /// only — see [PlayerCubit.onMirrorFailed].
  final bool mirrorFailed;

  /// The student pressed play. Nothing is fetched before this.
  final bool activated;

  /// «من الأول» was pressed: start at zero rather than at the resume point.
  final bool restart;

  /// Where playback should start THIS time.
  int get startSeconds => restart ? 0 : player.resumeSeconds;

  PlayerReady copyWith({
    LessonPlayer? player,
    LessonProgress? progress,
    double? courseProgressPercent,
    bool? justCompleted,
    bool? saveFailed,
    bool? completing,
    bool? completeFailed,
    bool clearCompleteError = false,
    bool? mirrorFailed,
    bool? activated,
    bool? restart,
  }) {
    return PlayerReady(
      player ?? this.player,
      progress: progress ?? _progress,
      courseProgressPercent:
          courseProgressPercent ?? this.courseProgressPercent,
      justCompleted: justCompleted ?? this.justCompleted,
      saveFailed: saveFailed ?? this.saveFailed,
      completing: completing ?? this.completing,
      completeFailed:
          clearCompleteError ? false : (completeFailed ?? this.completeFailed),
      mirrorFailed: mirrorFailed ?? this.mirrorFailed,
      activated: activated ?? this.activated,
      restart: restart ?? this.restart,
    );
  }

  @override
  List<Object?> get props => [
    player,
    _progress,
    courseProgressPercent,
    justCompleted,
    saveFailed,
    completing,
    completeFailed,
    mirrorFailed,
    activated,
    restart,
  ];
}
