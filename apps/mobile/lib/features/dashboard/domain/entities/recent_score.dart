import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One exam result, as the dashboard reports it.
@immutable
class RecentScore extends Equatable {
  const RecentScore({
    required this.attemptId,
    required this.quizTitle,
    required this.courseSlug,
    required this.scorePercent,
    required this.submittedAt,
  });

  final String attemptId;
  final String quizTitle;
  final String courseSlug;
  final double scorePercent;
  final DateTime submittedAt;

  /// 90% is `MASTERY_STRONG_AT` — the same threshold the «امتياز» badge uses.
  /// Defined once here so a screen cannot invent its own idea of a good mark.
  static const strongAt = 90;

  bool get isStrong => scorePercent >= strongAt;

  @override
  List<Object?> get props => [attemptId, quizTitle, courseSlug, scorePercent, submittedAt];
}
