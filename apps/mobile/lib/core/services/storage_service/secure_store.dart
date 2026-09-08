import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Keychain (iOS) / EncryptedSharedPreferences (Android) — the session token
/// and nothing that isn't at least as sensitive.
///
/// The session token is a 90-day bearer credential with no second factor
/// behind it: whoever holds it IS the student until it is revoked from
/// «أجهزتي». It never goes near [PreferencesStore].
class SecureStore {
  const SecureStore(this._storage);

  final FlutterSecureStorage _storage;

  /// `first_unlock` rather than the plugin's default `unlocked`.
  ///
  /// With `unlocked`, a silent push that wakes the app while the phone is
  /// still in a pocket cannot read the token: the fetch fails, and a
  /// notification addressed to the student by name opens on a signed-out
  /// screen. `first_unlock` keeps the item readable after the first unlock
  /// following a reboot.
  ///
  /// Deliberately NOT `first_unlock_this_device`: that flag blocks Keychain
  /// migration, so a student restoring an iCloud backup onto a new phone would
  /// arrive signed out. The session is revocable from «أجهزتي», so surviving a
  /// device migration is the right trade.
  static const _iosOptions = IOSOptions(
    accessibility: KeychainAccessibility.first_unlock,
  );

  /// The v11 defaults are already the strong ones — AES-GCM data encryption
  /// under an RSA-OAEP-wrapped Keystore key — so there is nothing to opt into.
  /// (`encryptedSharedPreferences: true` was the v9 spelling and no longer
  /// exists; it is gone because it is no longer optional.)
  ///
  /// `resetOnError` is left at its default `true`, and that IS a decision. A
  /// corrupted Keystore entry — which happens after some OEM restores and
  /// after a Keystore key is invalidated by a screen-lock change — otherwise
  /// throws on every read, and the app is bricked at launch with no way out
  /// but a reinstall. Resetting drops the token, which costs the student one
  /// sign-in.
  ///
  /// The namespace is explicit so that the entries are recognisable in a
  /// device backup and cannot collide with another plugin's.
  static const _androidOptions = AndroidOptions(
    storageNamespace: 'com.aymanaboelela.app.secure',
  );

  static const _kSessionToken = 'session_token';
  static const _kUserId = 'user_id';
  static const _kPushToken = 'push_token';

  factory SecureStore.create() => const SecureStore(
    FlutterSecureStorage(iOptions: _iosOptions, aOptions: _androidOptions),
  );

  /// The better-auth session token, as returned in `set-auth-token` / the
  /// sign-in response body. Sent back as `Authorization: Bearer <token>`.
  Future<String?> readSessionToken() => _storage.read(key: _kSessionToken);

  Future<void> writeSessionToken(String token) =>
      _storage.write(key: _kSessionToken, value: token);

  Future<void> deleteSessionToken() => _storage.delete(key: _kSessionToken);

  /// Kept beside the token so a cold start can decide whether the cached
  /// profile on disk belongs to the account the token authenticates, without
  /// a round trip. A mismatch means the previous user signed out badly and the
  /// cache must be dropped.
  Future<String?> readUserId() => _storage.read(key: _kUserId);

  Future<void> writeUserId(String id) => _storage.write(key: _kUserId, value: id);

  /// The last FCM token this device successfully registered with the server.
  ///
  /// Stored so the app can tell a genuine rotation (register the new one,
  /// retire the old) from the same token being handed back on every launch,
  /// which would otherwise be a write to `push_subscriptions` on every cold
  /// start for every student.
  Future<String?> readPushToken() => _storage.read(key: _kPushToken);

  Future<void> writePushToken(String token) =>
      _storage.write(key: _kPushToken, value: token);

  Future<void> deletePushToken() => _storage.delete(key: _kPushToken);

  /// Sign-out. Deliberately field by field rather than `deleteAll()`: a future
  /// key that must survive sign-out (a device identifier used for anti-abuse,
  /// say) would otherwise be erased by a call nobody would think to re-read.
  Future<void> clearSession() async {
    await _storage.delete(key: _kSessionToken);
    await _storage.delete(key: _kUserId);
    await _storage.delete(key: _kPushToken);
  }
}
