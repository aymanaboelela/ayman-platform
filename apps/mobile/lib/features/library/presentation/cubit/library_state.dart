part of 'library_cubit.dart';

sealed class LibraryState extends Equatable {
  const LibraryState();

  @override
  List<Object?> get props => [];
}

final class LibraryLoading extends LibraryState {
  const LibraryLoading();
}

final class LibraryFailed extends LibraryState {
  const LibraryFailed(this.failure);

  final Failure failure;

  @override
  List<Object?> get props => [failure];
}

final class LibraryReady extends LibraryState {
  const LibraryReady(this.view);

  final LibraryView view;

  @override
  List<Object?> get props => [view];
}
