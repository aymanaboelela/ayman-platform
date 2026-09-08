import '../../../../core/data/network/api_client.dart';
import '../../../../core/data/profile/profile_mapper.dart';
import '../../../../core/data/profile/profile_me.dart';

class OnboardingRemoteDataSource {
  const OnboardingRemoteDataSource(this._client);

  final ApiClient _client;

  /// Saves the wizard.
  ///
  /// ⚠️ `.strict()` server-side: an unknown key FAILS the whole request rather
  /// than being stripped. That is what closes mass assignment — a payload
  /// carrying `role` or `onboardingCompletedAt` is refused — and it is also
  /// why `motherPhone` cannot be sent at all, even as null.
  ///
  /// ⚠️ 409 means the phone belongs to another account. That one has a field
  /// of its own to walk back to, so the caller has to tell it apart.
  Future<Result<StudentProfile>> submit(Map<String, dynamic> body) {
    return _client.patch<StudentProfile>(
      '/profile/onboarding',
      body: body,
      // The response is the whole profile row.
      parse: (data) =>
          ProfileMapper.fromJson({'userId': '', 'onboardingCompleted': true, 'profile': data})
              .profile ??
          const StudentProfile(),
    );
  }
}
