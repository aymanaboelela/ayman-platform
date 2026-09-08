import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/library_view.dart';
import '../../domain/repositories/library_repository.dart';

part 'library_state.dart';

/// Owns «الكورسات».
class LibraryCubit extends Cubit<LibraryState> {
  LibraryCubit(this._repository) : super(const LibraryLoading());

  final LibraryRepository _repository;

  Future<void> load() async {
    if (state is! LibraryReady) emit(const LibraryLoading());
    final result = await _repository.load();
    result.fold(
      (failure) => emit(LibraryFailed(failure)),
      (view) => emit(LibraryReady(view)),
    );
  }

  /// Pull-to-refresh.
  ///
  /// ⚠️ A FAILED refresh keeps the content and says nothing — the same rule
  /// the dashboard follows. Replacing a screenful of courses with an error
  /// because one refresh timed out on a train takes away information the
  /// student already had, to tell them something they can see for themselves.
  Future<void> refresh() async {
    final current = state;
    final result = await _repository.load();
    result.fold(
      (failure) {
        if (current is! LibraryReady) emit(LibraryFailed(failure));
      },
      (view) => emit(LibraryReady(view)),
    );
  }
}
