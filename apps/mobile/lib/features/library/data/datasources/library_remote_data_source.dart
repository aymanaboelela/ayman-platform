import '../../../../core/data/network/api_client.dart';
import '../../../../core/data/profile/profile_mapper.dart';
import '../../../../core/data/profile/profile_me.dart';
import '../../domain/entities/catalog_course.dart';
import '../../domain/entities/path_course.dart';
import '../models/library_mapper.dart';

/// The three network reads «الكورسات» makes.
///
/// The FOURTH input — the taxonomy — is not here: it goes through the shared
/// [TaxonomyRepository], which caches it for every screen that wants it.
/// Adding a fourth method here would be a second, uncached copy of a read the
/// API throttles.
class LibraryRemoteDataSource {
  const LibraryRemoteDataSource(this._client);

  final ApiClient _client;

  /// The public catalogue — the same list the marketing site shows.
  Future<Result<List<CatalogCourse>>> catalog() {
    return _client.get<List<CatalogCourse>>(
      '/catalog/courses',
      parse: (data) => LibraryMapper.catalog(data as Map<String, dynamic>),
    );
  }

  /// What the student has actually done. Enrolled courses only.
  Future<Result<List<PathCourse>>> path() {
    return _client.get<List<PathCourse>>(
      '/me/path',
      parse: (data) => LibraryMapper.path(data as Map<String, dynamic>),
    );
  }

  Future<Result<ProfileMe>> profile() {
    return _client.get<ProfileMe>(
      '/profile/me',
      parse: (data) => ProfileMapper.fromJson(data as Map<String, dynamic>),
    );
  }
}
