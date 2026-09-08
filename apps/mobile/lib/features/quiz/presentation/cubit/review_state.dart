part of 'review_cubit.dart';

sealed class ReviewState extends Equatable {
  const ReviewState();

  @override
  List<Object?> get props => [];
}

final class ReviewLoading extends ReviewState {
  const ReviewLoading();
}

final class ReviewFailed extends ReviewState {
  const ReviewFailed(this.failure);

  final Failure failure;

  @override
  List<Object?> get props => [failure];
}

final class ReviewReady extends ReviewState {
  const ReviewReady(this.payload, {this.wrongOnly = false});

  final ReviewPayload payload;
  final bool wrongOnly;

  @override
  List<Object?> get props => [payload, wrongOnly];
}
