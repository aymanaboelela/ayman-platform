import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/repositories/dashboard_repository.dart';

part 'dashboard_state.dart';

/// Owns «حسابي».
class DashboardCubit extends Cubit<DashboardState> {
  DashboardCubit(this._repository) : super(const DashboardLoading());

  final DashboardRepository _repository;

  Future<void> load() async {
    if (state is! DashboardReady) emit(const DashboardLoading());
    final result = await _repository.load();
    result.fold(
      (failure) => emit(DashboardFailed(failure)),
      (dashboard) => emit(DashboardReady(dashboard)),
    );
  }

  /// Pull-to-refresh.
  ///
  /// ⚠️ A FAILED refresh keeps the old content and says nothing.
  ///
  /// The student is looking at their own courses; replacing them with an error
  /// screen because one refresh timed out on a train loses information they
  /// already had, to tell them something they can see for themselves. The
  /// spinner stopping is the whole report.
  Future<void> refresh() async {
    final current = state;
    if (current is DashboardReady) {
      emit(current.copyWith(refreshing: true));
    }

    final result = await _repository.load();
    result.fold(
      (failure) {
        if (current is DashboardReady) {
          emit(current.copyWith(refreshing: false));
        } else {
          emit(DashboardFailed(failure));
        }
      },
      (dashboard) => emit(DashboardReady(dashboard)),
    );
  }
}
