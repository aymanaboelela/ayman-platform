import '../network/api_client.dart';
import 'profile_mapper.dart';
import 'profile_me.dart';

/// Reads the student's own profile.
///
/// Separate from the library's own fetch because ONE caller needs it before
/// the first frame — the router, to decide whether the wizard is still owed —
/// and that caller cannot wait for a screen to mount.
class ProfileRepository {
  const ProfileRepository(this._client);

  final ApiClient _client;

  /// ⚠️ NULL on failure, never an exception. The caller decides what a
  /// missing answer means, and for the router it means "let them in" rather
  /// than "trap them in the wizard".
  Future<ProfileMe?> me() async {
    final result = await _client.get<ProfileMe>(
      '/profile/me',
      parse: (data) => ProfileMapper.fromJson(data as Map<String, dynamic>),
    );
    return result.isOk ? result.value : null;
  }
}
