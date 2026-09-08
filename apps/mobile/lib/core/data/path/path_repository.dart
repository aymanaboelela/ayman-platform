import '../network/api_client.dart';
import 'learning_path.dart';
import 'path_mapper.dart';

/// The one place `/api/me/path` is read.
///
/// ## Why this is shared and NOT cached
///
/// Shared because four screens want it — «الكورسات» joins it to the catalogue,
/// the course page joins it to one course's outline, «رحلتي» draws the map,
/// «حسابي» counts it. One entity and one parse, so none of them can disagree
/// about what `clearedLessons` counts.
///
/// Not cached because it is the half of every screen that is DIFFERENT per
/// request: it carries the gate and the progress, and both move the moment a
/// student finishes a lesson. A stale copy would show a student the lecture
/// they just watched as unwatched — the one thing this payload exists to get
/// right. The taxonomy next door is cached precisely because it is the
/// opposite kind of data.
class PathRepository {
  const PathRepository(this._client);

  final ApiClient _client;

  Future<Result<LearningPath>> load() {
    return _client.get<LearningPath>(
      '/me/path',
      parse: (data) => PathMapper.fromJson(data as Map<String, dynamic>),
    );
  }
}
