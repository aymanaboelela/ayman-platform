import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../entities/attempt.dart';
import '../entities/attempt_review.dart';
import '../entities/quiz_overview.dart';

abstract interface class QuizRepository {
  Future<Either<Failure, QuizOverview>> overview(String lessonId);

  Future<Either<Failure, StartedAttempt>> start(String quizId);

  Future<Either<Failure, StartedAttempt>> resume(String attemptId);

  Future<Either<Failure, SaveResult>> saveAnswers(
    String attemptId, {
    required String attemptToken,
    required int seq,
    required Map<int, AnswerResponse?> answers,
  });

  Future<Either<Failure, bool>> flag(
    String attemptId, {
    required String attemptToken,
    required int slotPosition,
    required bool flagged,
  });

  Future<Either<Failure, ({int unansweredCount, int total})>> preflight(
    String attemptId,
  );

  Future<Either<Failure, AttemptResult>> submit(
    String attemptId, {
    required String attemptToken,
  });

  Future<Either<Failure, ReviewPayload>> review(String attemptId);
}
