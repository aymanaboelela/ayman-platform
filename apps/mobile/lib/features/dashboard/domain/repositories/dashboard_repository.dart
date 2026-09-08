import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../entities/dashboard.dart';

abstract interface class DashboardRepository {
  /// The home screen's required data.
  ///
  /// A failure here DOES take the page down — it is one of the three calls the
  /// web also lets fail loudly. Everything optional on the home screen is
  /// fetched by its own section and degrades to not rendering.
  Future<Either<Failure, Dashboard>> load();
}
