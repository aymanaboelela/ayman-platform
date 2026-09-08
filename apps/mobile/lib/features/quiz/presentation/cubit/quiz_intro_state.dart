part of 'quiz_intro_cubit.dart';

sealed class QuizIntroState extends Equatable {
  const QuizIntroState();

  @override
  List<Object?> get props => [];
}

final class QuizIntroLoading extends QuizIntroState {
  const QuizIntroLoading();
}

final class QuizIntroFailed extends QuizIntroState {
  const QuizIntroFailed(this.failure);

  final Failure failure;

  @override
  List<Object?> get props => [failure];
}

final class QuizIntroReady extends QuizIntroState {
  const QuizIntroReady(this.overview);

  final QuizOverview overview;

  @override
  List<Object?> get props => [overview];
}
