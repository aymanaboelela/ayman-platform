import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../datasources/dashboard_remote_data_source.dart';

class DashboardRepositoryImpl implements DashboardRepository {
  const DashboardRepositoryImpl(this._remote);

  final DashboardRemoteDataSource _remote;

  @override
  Future<Either<Failure, Dashboard>> load() async {
    final result = await _remote.dashboard();
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }
}
