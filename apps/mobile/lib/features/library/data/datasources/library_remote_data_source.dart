import '../../../../core/data/network/api_client.dart';
import '../../../../core/data/profile/profile_mapper.dart';
import '../../../../core/data/profile/profile_me.dart';
import '../../domain/entities/catalog_course.dart';
import '../models/library_mapper.dart';

/// The two network reads that belong to «الكورسات» alone.
///
/// The other two inputs are SHARED and go through their own repositories:
/// `/me/path` through [PathRepository], the taxonomy through
/// [TaxonomyRepository] which caches it for every screen that wants it. A
/// private copy of either here would be a second parse of a payload three
/// other screens already read.
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

  Future<Result<ProfileMe>> profile() {
    return _client.get<ProfileMe>(
      '/profile/me',
      parse: (data) => ProfileMapper.fromJson(data as Map<String, dynamic>),
    );
  }
}
