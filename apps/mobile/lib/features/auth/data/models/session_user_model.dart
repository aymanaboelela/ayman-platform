import '../../domain/entities/session_user.dart';

/// Parses `GET /api/session`.
///
/// Written by hand rather than generated, for the same reason the web mirrors
/// the shape in a zod schema instead of trusting the type: this endpoint is the
/// answer to "who is this and what may they see", and a silently-wrong parse
/// there is an authorisation-shaped bug even though the guard is server-side —
/// a student who parses as an admin sees admin screens full of 403s.
extension SessionUserMapper on SessionUser {
  /// ⚠️ `email`, `phoneNumber` and `image` are NULLABLE, not OPTIONAL.
  ///
  /// The API always sends the key; the value may be null. Reading them with
  /// `?? ''` would turn "this account has no email" into "this account's email
  /// is the empty string", and `identityLabel` would then print an empty line
  /// instead of falling through to the phone number.
  static SessionUser fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String?,
      phoneNumber: json['phoneNumber'] as String?,
      image: json['image'] as String?,
      // Defaulted rather than required. The server always sends it, but an
      // absent role must degrade to the least privilege — `permissionsForRole`
      // fails closed on an unknown role, and so should this.
      role: json['role'] as String? ?? 'student',
      permissions: (json['permissions'] as List<dynamic>? ?? const [])
          .cast<String>()
          .toList(growable: false),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'phoneNumber': phoneNumber,
    'image': image,
    'role': role,
    'permissions': permissions,
  };
}
