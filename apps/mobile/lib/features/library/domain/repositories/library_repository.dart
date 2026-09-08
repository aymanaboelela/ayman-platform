import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../entities/library_view.dart';

abstract interface class LibraryRepository {
  /// «الكورسات», assembled.
  ///
  /// Fails only when the CATALOGUE or the PROFILE cannot be read — those two
  /// decide what is on the screen and who it is for. A failed path read
  /// degrades to "enrolled in nothing" and a failed taxonomy read degrades the
  /// headings; neither takes the page down, because a library that renders
  /// with plain year headings is worth far more than an error screen.
  Future<Either<Failure, LibraryView>> load();
}
