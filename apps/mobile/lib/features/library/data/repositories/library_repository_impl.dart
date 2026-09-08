import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/data/taxonomy/taxonomy_repository.dart';
import '../../domain/entities/library_view.dart';
import '../../domain/library_builder.dart';
import '../../domain/repositories/library_repository.dart';
import '../datasources/library_remote_data_source.dart';

class LibraryRepositoryImpl implements LibraryRepository {
  const LibraryRepositoryImpl({
    required LibraryRemoteDataSource remote,
    required TaxonomyRepository taxonomy,
  })  : _remote = remote,
        _taxonomy = taxonomy;

  final LibraryRemoteDataSource _remote;
  final TaxonomyRepository _taxonomy;

  @override
  Future<Either<Failure, LibraryView>> load() async {
    // All four in parallel, as a RECORD rather than a `Future.wait` list.
    //
    // `Future.wait` erases four different result types into one `List<dynamic>`
    // and every read back out is an unchecked cast — exactly the place a field
    // rename becomes a runtime crash the analyzer had no way to see. The record
    // form keeps all four types.
    final (catalog, path, profile, taxonomy) = await (
      _remote.catalog(),
      _remote.path(),
      _remote.profile(),
      _taxonomy.load(),
    ).wait;

    // ⚠️ The two that CAN take the page down, and only these two.
    //
    // Without the catalogue there is nothing to render; without the profile
    // there is no way to say which courses are the student's, and rendering
    // every year as «باقي الصفوف» would tell them their own year is somebody
    // else's. Everything below degrades instead.
    if (!catalog.isOk) return Left(catalog.failure!);
    if (!profile.isOk) return Left(profile.failure!);

    return Right(
      LibraryBuilder.build(
        courses: catalog.value,
        // A failed path read means "enrolled in nothing" for this render: every
        // card falls back to «نبدأ الكورس», which is wrong for an enrolled
        // student and recoverable with a pull-to-refresh. The alternative is an
        // error screen over a catalogue we successfully fetched.
        path: path.isOk ? path.value : const [],
        me: profile.value,
        taxonomy: taxonomy,
      ),
    );
  }
}
