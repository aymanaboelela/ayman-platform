import 'dart:async';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../data/network/api_client.dart';
import '../storage_service/preferences_store.dart';
import '../storage_service/secure_store.dart';

/// Registers this device for push and keeps its token current.
///
/// ## What this does NOT do
///
/// It does not display anything. A notification that arrives while the app is
/// in the FOREGROUND is handled by the app's own UI — a banner over the
/// current screen — and one that arrives in the background is drawn by the OS
/// from the payload's `notification` block. Neither is this class's job.
///
/// ## The token is registered on EVERY launch
///
/// FCM rotates a registration token when the app is restored onto a new
/// device, when its data is cleared, or when the install re-registers, and it
/// does not tell the server that used to hold the old one. So the app posts
/// its token at every launch and the API upserts; `lastSeenAt` on the row is
/// what eventually lets a sweep drop the tokens of apps that were uninstalled,
/// which FCM keeps accepting sends to forever while silently dropping them.
///
/// A local copy is kept so the common case — the same token handed back on
/// every cold start — does not become a database write per launch per student.
class PushService {
  PushService({
    required ApiClient client,
    required SecureStore secureStore,
    required PreferencesStore preferences,
  })  : _client = client,
        _secure = secureStore,
        _preferences = preferences;

  final ApiClient _client;
  final SecureStore _secure;
  final PreferencesStore _preferences;

  StreamSubscription<String>? _refreshSub;

  /// Asks for permission, then registers.
  ///
  /// ⚠️ Call this AFTER the student is signed in and has seen something of the
  /// app, never on first launch. iOS lets an app ask exactly ONCE — a second
  /// request after a refusal returns immediately with no prompt — and a prompt
  /// fired before a student knows what the app is gets refused far more often
  /// than one fired after their first lesson.
  Future<void> registerIfPermitted() async {
    final messaging = FirebaseMessaging.instance;

    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      // NOT provisional. A provisional authorisation delivers quietly to the
      // notification centre with no sound and no banner, which for a student
      // waiting on an exam result is indistinguishable from not being told.
      provisional: false,
    );

    await _preferences.setPushPromptedAt(DateTime.now());

    if (settings.authorizationStatus != AuthorizationStatus.authorized &&
        settings.authorizationStatus != AuthorizationStatus.provisional) {
      return;
    }

    // ⚠️ iOS needs the APNs token before it will mint an FCM one, and it
    // arrives asynchronously after the permission grant. Asking too early
    // returns null, and the usual "fix" is a retry loop; waiting for the token
    // the platform is actually waiting on is the honest version.
    if (Platform.isIOS) {
      final apns = await messaging.getAPNSToken();
      if (apns == null) return;
    }

    final token = await messaging.getToken();
    if (token != null) await _register(token);

    // A rotation arrives here and nowhere else. Without this subscription the
    // app keeps working perfectly and simply stops receiving notifications,
    // with nothing anywhere reporting why.
    _refreshSub?.cancel();
    _refreshSub = messaging.onTokenRefresh.listen(_register);
  }

  Future<void> _register(String token) async {
    // The same token on every cold start is the common case. Posting it anyway
    // would be one write per launch per student, for no change.
    final known = await _secure.readPushToken();
    if (known == token) return;

    final info = await PackageInfo.fromPlatform();
    final result = await _client.post<void>(
      '/me/push/device',
      body: {
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
        'appVersion': '${info.version} (${info.buildNumber})',
      },
    );

    // Stored only on success, so a failed registration is retried next launch
    // rather than being remembered as done.
    if (result.isOk) await _secure.writePushToken(token);
  }

  /// Retires this device's token on sign-out.
  ///
  /// Best-effort, and the LOCAL delete happens regardless: leaving a token
  /// registered against an account the student has signed out of means the
  /// next person to use the phone gets their notifications.
  Future<void> unregister() async {
    final token = await _secure.readPushToken();
    if (token == null) return;

    await _client.post<void>('/me/push/unsubscribe', body: {'endpoint': token});
    await _secure.deletePushToken();
    await _refreshSub?.cancel();
    _refreshSub = null;

    // Also drop it at the FCM end, so a token that was never delivered to the
    // server cannot be reused either.
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (error) {
      // A delete that fails leaves a token the server no longer knows about,
      // which is harmless — sends to it go nowhere.
      if (kDebugMode) debugPrint('FCM deleteToken failed: $error');
    }
  }

  Future<void> dispose() async {
    await _refreshSub?.cancel();
    _refreshSub = null;
  }
}
