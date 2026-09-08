import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One lesson's progress, as every progress response carries it.
@immutable
class LessonProgress extends Equatable {
  const LessonProgress({
    required this.lessonId,
    required this.state,
    required this.completion,
    required this.watchedSeconds,
    required this.maxPositionSeconds,
    required this.openCount,
    this.completedAt,
    this.completedVia,
  });

  final String lessonId;

  /// `not_started` | `in_progress` | `completed` | `passed` | `failed`.
  final String state;

  /// 0..1, four decimals — the column is `numeric(5,4)`.
  final double completion;

  /// Seconds of ACTUAL playback, lifetime. Never rewritten by a manual
  /// completion — that is what keeps "earned" and "claimed" separable.
  final int watchedSeconds;

  /// The furthest point reached, lifetime.
  final int maxPositionSeconds;

  final int openCount;
  final DateTime? completedAt;

  /// `auto` | `manual` | `dwell`, or null.
  final String? completedVia;

  bool get isComplete => completedAt != null;

  /// Finished by any route the outline recognises.
  bool get isFinished =>
      state == 'completed' || state == 'passed' || completedAt != null;

  /// The empty row a lesson has before it is ever opened.
  factory LessonProgress.empty(String lessonId) => LessonProgress(
        lessonId: lessonId,
        state: 'not_started',
        completion: 0,
        watchedSeconds: 0,
        maxPositionSeconds: 0,
        openCount: 0,
      );

  @override
  List<Object?> get props => [
    lessonId,
    state,
    completion,
    watchedSeconds,
    maxPositionSeconds,
    openCount,
    completedAt,
    completedVia,
  ];
}

/// What the heartbeat, dwell and complete routes all answer with.
@immutable
class HeartbeatResult extends Equatable {
  const HeartbeatResult({
    required this.progress,
    required this.justCompleted,
    required this.courseProgressPercent,
  });

  final LessonProgress progress;

  /// ⚠️ SERVER-decided, and true for exactly ONE response — the request that
  /// crossed the line. The client mirrors it; it never computes it.
  final bool justCompleted;

  final double courseProgressPercent;

  @override
  List<Object?> get props => [progress, justCompleted, courseProgressPercent];
}
