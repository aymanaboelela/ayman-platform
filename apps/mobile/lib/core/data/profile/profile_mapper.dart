import 'profile_me.dart';

/// Parses `GET /api/profile/me`.
///
/// Hand-written against `ProfileMeSchema` in
/// `packages/contracts/src/profile.ts`, which is a `looseObject` — the API
/// sends the whole row and only the named fields are typed. Reading a field
/// that is not mapped here means adding it here first, exactly as the web adds
/// it to the schema.
abstract final class ProfileMapper {
  static ProfileMe fromJson(Map<String, dynamic> json) {
    final profile = json['profile'];
    return ProfileMe(
      userId: json['userId'] as String,
      onboardingCompleted: json['onboardingCompleted'] as bool? ?? false,
      profile: profile is Map<String, dynamic> ? _profile(profile) : null,
    );
  }

  static StudentProfile _profile(Map<String, dynamic> json) {
    return StudentProfile(
      fullName: json['fullName'] as String?,
      phone: json['phone'] as String?,
      schoolName: json['schoolName'] as String?,
      governorateCode: json['governorateCode'] as String?,
      year: (json['year'] as num?)?.toInt(),
      systemId: json['systemId'] as String?,
      trackId: json['trackId'] as String?,
      schoolStream: json['schoolStream'] as String?,
      gender: json['gender'] as String?,
      fatherPhone: json['fatherPhone'] as String?,
    );
  }
}
