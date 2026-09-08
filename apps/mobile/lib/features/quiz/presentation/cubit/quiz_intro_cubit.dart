import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/quiz_overview.dart';
import '../../domain/repositories/quiz_repository.dart';

part 'quiz_intro_state.dart';

/// The screen before the exam: what it is, and every past sitting.
class QuizIntroCubit extends Cubit<QuizIntroState> {
  QuizIntroCubit(this._repository, this.lessonId)
      : super(const QuizIntroLoading());

  final QuizRepository _repository;
  final String lessonId;

  Future<void> load() async {
    if (state is! QuizIntroReady) emit(const QuizIntroLoading());
    final result = await _repository.overview(lessonId);
    result.fold(
      (failure) => emit(QuizIntroFailed(failure)),
      (overview) => emit(QuizIntroReady(overview)),
    );
  }
}
