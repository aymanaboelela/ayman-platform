import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// Who is signed in, as `GET /api/session` reports them.
///
/// This is the app's copy of the ONE endpoint that answers "who is this and
/// what may they see" in a single round trip. better-auth's own
/// `/api/auth/get-session` returns more of the row but no permission list, so
/// the app would need a second call to render a single admin link.
@immutable
class SessionUser extends Equatable {
  const SessionUser({
    required this.id,
    required this.name,
    required this.role,
    required this.permissions,
    this.email,
    this.phoneNumber,
    this.image,
  });

  /// ⚠️ A better-auth NANOID, not a UUID.
  ///
  /// `User.id` is a bare `String @id` with no `@default(uuid())`. Validating
  /// one with a UUID pattern passes every hand-written fixture and rejects
  /// every real student — this repo has already been bitten by exactly that.
  final String id;

  final String name;

  /// Null both when the account has no email AND when the stored value was a
  /// `@phone.invalid` placeholder — the API strips those before answering, so
  /// the app never has to know the placeholder convention exists.
  final String? email;

  /// E.164 (`+201012345678`), or null. A Google account has none until
  /// onboarding collects it.
  final String? phoneNumber;

  final String? image;

  /// `'admin'` or `'student'` today. Kept as a String rather than an enum
  /// because the server treats an unknown role as "no permissions" and a
  /// client enum would throw on a role added later instead of degrading.
  final String role;

  /// The CONCRETE list — never `'*'`, even for an admin.
  ///
  /// ⚠️ This decides what to RENDER. It is never the authorisation decision:
  /// the API re-checks on every request, and a client that hid a control it
  /// was not entitled to would still be able to call the endpoint. Hiding is a
  /// courtesy; the guard is the control.
  final List<String> permissions;

  bool can(String permission) => permissions.contains(permission);

  /// Whether to show the admin section at all.
  bool get isAdmin => can('admin:access');

  /// What the account menu prints under the name.
  ///
  /// Email first, then phone, then nothing — and `null` is a REAL state, not a
  /// bug: an admin created by the bootstrap script has neither. Rendered LTR
  /// inside the RTL page, because a phone number laid out right-to-left is a
  /// different number.
  String? get identityLabel => email ?? phoneNumber;

  /// Initials for the avatar fallback: first letter of the first word and of
  /// the LAST word, which for «أيمن أبو العلا» gives «أ ا» rather than the
  /// «أ أ» a naive first-two-words rule produces.
  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '؟';
    if (parts.length == 1) return parts.first.characters.first;
    return '${parts.first.characters.first}${parts.last.characters.first}';
  }

  @override
  List<Object?> get props => [id, name, email, phoneNumber, image, role, permissions];
}

/// `characters` without pulling the package in for one call.
///
/// `String.split('')` on Arabic is not safe — it splits on UTF-16 code units,
/// and a name that begins with an emoji or a character outside the BMP would
/// yield half a surrogate pair.
extension on String {
  Iterable<String> get characters => runes.map(String.fromCharCode);
}
