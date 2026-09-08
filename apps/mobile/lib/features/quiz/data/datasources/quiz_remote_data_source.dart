import '../../../../core/data/network/api_client.dart';
import '../../domain/entities/attempt.dart';
import '../../domain/entities/attempt_review.dart';
import '../../domain/entities/quiz_overview.dart';
import '../models/quiz_mapper.dart';

/// The learner's quiz routes.
class QuizRemoteDataSource {
  const QuizRemoteDataSource(this._client);

  final ApiClient _client;

  /// The intro screen: what this quiz is, and every past sitting.
  Future<Result<QuizOverview>> overview(String lessonId) {
    return _client.get<QuizOverview>(
      '/quiz/lessons/${Uri.encodeComponent(lessonId)}',
      parse: (data) => QuizMapper.overview(data as Map<String, dynamic>),
    );
  }

  /// Starts a sitting. The body is IGNORED server-side; `{}` is correct.
  Future<Result<StartedAttempt>> start(String quizId) {
    return _client.post<StartedAttempt>(
      '/quiz/quizzes/${Uri.encodeComponent(quizId)}/attempts',
      body: const <String, dynamic>{},
      parse: (data) => QuizMapper.startedAttempt(data as Map<String, dynamic>),
    );
  }

  /// Picks a running sitting back up — after the app was killed, or the
  /// student walked away.
  Future<Result<StartedAttempt>> resume(String attemptId) {
    return _client.post<StartedAttempt>(
      '/quiz/attempts/${Uri.encodeComponent(attemptId)}/resume',
      body: const <String, dynamic>{},
      parse: (data) => QuizMapper.startedAttempt(data as Map<String, dynamic>),
    );
  }

  /// Saves answers.
  ///
  /// ⚠️ [seq] must be MONOTONIC per client. The server skips any slot whose
  /// stored `responseSeq >= seq`, which is what stops a late write from a slow
  /// connection overwriting a newer answer — and what makes an out-of-order
  /// client silently lose its own writes.
  Future<Result<SaveResult>> saveAnswers(
    String attemptId, {
    required String attemptToken,
    required int seq,
    required Map<int, AnswerResponse?> answers,
  }) {
    return _client.put<SaveResult>(
      '/quiz/attempts/${Uri.encodeComponent(attemptId)}/answers',
      body: {
        'attemptToken': attemptToken,
        'seq': seq,
        'answers': [
          for (final entry in answers.entries)
            {
              'slotPosition': entry.key,
              // `null` CLEARS the answer — a distinct act from never having
              // answered, and the only way back to «لسه ما جاوبتش».
              'response': entry.value?.toJson(),
            },
        ],
      },
      parse: (data) => QuizMapper.saveResult(data as Map<String, dynamic>),
    );
  }

  /// ⚠️ Flags do NOT ride the answer autosave — the save schema has no field
  /// for them. Sent per toggle, or they are silently lost on reload, which is
  /// a bug the web shipped for months.
  Future<Result<bool>> flag(
    String attemptId, {
    required String attemptToken,
    required int slotPosition,
    required bool flagged,
  }) {
    return _client.post<bool>(
      '/quiz/attempts/${Uri.encodeComponent(attemptId)}/flag',
      body: {
        'attemptToken': attemptToken,
        'slotPosition': slotPosition,
        'flagged': flagged,
      },
      parse: (data) => (data as Map<String, dynamic>)['flagged'] as bool,
    );
  }

  /// «فاضل {n} سؤال» before the hand-in.
  Future<Result<({int unansweredCount, int total})>> preflight(String attemptId) {
    return _client.get<({int unansweredCount, int total})>(
      '/quiz/attempts/${Uri.encodeComponent(attemptId)}/preflight',
      parse: (data) {
        final json = data as Map<String, dynamic>;
        return (
          unansweredCount: (json['unansweredCount'] as num).toInt(),
          total: (json['total'] as num).toInt(),
        );
      },
    );
  }

  Future<Result<AttemptResult>> submit(
    String attemptId, {
    required String attemptToken,
  }) {
    return _client.post<AttemptResult>(
      '/quiz/attempts/${Uri.encodeComponent(attemptId)}/submit',
      body: {'attemptToken': attemptToken},
      parse: (data) => QuizMapper.attemptResult(data as Map<String, dynamic>),
    );
  }

  Future<Result<ReviewPayload>> review(String attemptId) {
    return _client.get<ReviewPayload>(
      '/quiz/attempts/${Uri.encodeComponent(attemptId)}/review',
      parse: (data) => QuizMapper.review(data as Map<String, dynamic>),
    );
  }
}
