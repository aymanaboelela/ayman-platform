import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/attempt_review.dart';
import '../../domain/repositories/quiz_repository.dart';

part 'review_state.dart';

/// The answers, after the paper is in.
class ReviewCubit extends Cubit<ReviewState> {
  ReviewCubit(this._repository, this.attemptId) : super(const ReviewLoading());

  final QuizRepository _repository;
  final String attemptId;

  /// «الغلطات بس» — a filter, not a different request.
  bool wrongOnly = false;

  Future<void> load() async {
    if (state is! ReviewReady) emit(const ReviewLoading());
    final result = await _repository.review(attemptId);
    result.fold(
      (failure) => emit(ReviewFailed(failure)),
      (payload) => emit(ReviewReady(payload, wrongOnly: wrongOnly)),
    );
  }

  void toggleWrongOnly() {
    final current = state;
    if (current is! ReviewReady) return;
    wrongOnly = !wrongOnly;
    emit(ReviewReady(current.payload, wrongOnly: wrongOnly));
  }
}
