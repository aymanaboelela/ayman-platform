import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// What a native provider SDK hands back, reduced to the four things
/// `/api/auth/sign-in/social` actually needs.
@immutable
class SocialCredential extends Equatable {
  const SocialCredential({
    required this.idToken,
    this.nonce,
    this.accessToken,
    this.fullName,
  });

  /// The signed JWT. The server verifies its signature and its `aud` claim.
  final String idToken;

  /// The nonce the token was MINTED with.
  ///
  /// Not optional in practice for Apple: better-auth compares the token's
  /// `nonce` claim against this value, and a mismatch is `INVALID_TOKEN` — a
  /// replay defence, and the reason the SHA-256 of the raw nonce goes to Apple
  /// while the RAW nonce comes here.
  final String? nonce;

  final String? accessToken;

  /// Apple only, and only ever on the FIRST authorisation for a given Apple ID.
  ///
  /// `{ "firstName": …, "lastName": … }` in the shape better-auth expects.
  /// Apple never sends it again — not on a re-install, not on a new device —
  /// so an app that drops it here creates an account with an empty name that
  /// nothing can repair afterwards. Null for Google, which puts the name in
  /// the token itself.
  final Map<String, dynamic>? fullName;

  @override
  List<Object?> get props => [idToken, nonce, accessToken, fullName];
}
