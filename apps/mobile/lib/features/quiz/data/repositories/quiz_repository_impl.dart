import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/data/network/api_client.dart';
import '../../domain/entities/attempt.dart';
import '../../domain/entities/attempt_review.dart';
import '../../domain/entities/quiz_overview.dart';
import '../../domain/repositories/quiz_repository.dart';
import '../datasources/quiz_remote_data_source.dart';

class QuizRepositoryImpl implements QuizRepository {
  const QuizRepositoryImpl(this._remote);

  final QuizRemoteDataSource _remote;

  Either<Failure, T> _fold<T>(Result<T> result) =>
      result.isOk ? Right(result.value) : Left(result.failure!);

  @override
  Future<Either<Failure, QuizOverview>> overview(String lessonId) async =>
      _fold(await _remote.overview(lessonId));

  @override
  Future<Either<Failure, StartedAttempt>> start(String quizId) async =>
      _fold(await _remote.start(quizId));

  @override
  Future<Either<Failure, StartedAttempt>> resume(String attemptId) async =>
      _fold(await _remote.resume(attemptId));

  @override
  Future<Either<Failure, SaveResult>> saveAnswers(
    String attemptId, {
    required String attemptToken,
    required int seq,
    required Map<int, AnswerResponse?> answers,
  }) async =>
      _fold(
        await _remote.saveAnswers(
          attemptId,
          attemptToken: attemptToken,
          seq: seq,
          answers: answers,
        ),
      );

  @override
  Future<Either<Failure, bool>> flag(
    String attemptId, {
    required String attemptToken,
    required int slotPosition,
    required bool flagged,
  }) async =>
      _fold(
        await _remote.flag(
          attemptId,
          attemptToken: attemptToken,
          slotPosition: slotPosition,
          flagged: flagged,
        ),
      );

  @override
  Future<Either<Failure, ({int unansweredCount, int total})>> preflight(
    String attemptId,
  ) async =>
      _fold(await _remote.preflight(attemptId));

  @override
  Future<Either<Failure, AttemptResult>> submit(
    String attemptId, {
    required String attemptToken,
  }) async =>
      _fold(await _remote.submit(attemptId, attemptToken: attemptToken));

  @override
  Future<Either<Failure, ReviewPayload>> review(String attemptId) async =>
      _fold(await _remote.review(attemptId));
}
