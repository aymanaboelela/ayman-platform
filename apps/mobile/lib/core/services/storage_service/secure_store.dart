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

  /// `first_unlock` rather than the default `unlocked`.
  ///
  /// Without it, a push notification that wakes the app while the phone is
  /// still locked cannot read the token, so the tap-through fetch fails and
  /// the student lands on a signed-out screen from a notification that was
  /// addressed to them by name. `first_unlock` keeps the item readable after
  /// the first unlock following a reboot — and specifically NOT
  /// `..._this_device_only`'s weaker sibling `always`, which survives without
  /// a passcode at all.
  static const _iosOptions = IOSOptions(
    accessibility: KeychainAccessibility.first_unlock,
  );

  /// `encryptedSharedPreferences` is the default on modern plugin versions but
  /// is stated here anyway: the fallback is a plain XML file, and the
  /// difference is invisible until someone reads a backup.
  static const _androidOptions = AndroidOptions(
    encryptedSharedPreferences: true,
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
