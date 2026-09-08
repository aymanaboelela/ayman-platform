import 'package:shared_preferences/shared_preferences.dart';

/// Non-secret, non-sensitive device preferences.
///
/// Anything a thief reading the phone's backup could learn from this file must
/// be harmless: the chosen theme, the chosen language, whether onboarding has
/// been seen. Tokens, phone numbers and identifiers go to [SecureStore]
/// instead, which is Keychain/Keystore-backed.
///
/// Deliberately synchronous once [load] has completed, so that the theme and
/// locale are known before the first frame instead of one frame after it.
class PreferencesStore {
  PreferencesStore(this._prefs);

  final SharedPreferences _prefs;

  static Future<PreferencesStore> load() async =>
      PreferencesStore(await SharedPreferences.getInstance());

  static const _kThemeChoice = 'theme_choice';
  static const _kLocale = 'locale';
  static const _kOnboardingSeen = 'onboarding_seen';
  static const _kLastRoute = 'last_route';
  static const _kPushPromptedAt = 'push_prompted_at';

  String? get themeChoice => _prefs.getString(_kThemeChoice);
  Future<void> setThemeChoice(String value) =>
      _prefs.setString(_kThemeChoice, value);

  String? get locale => _prefs.getString(_kLocale);
  Future<void> setLocale(String value) => _prefs.setString(_kLocale, value);

  bool get onboardingSeen => _prefs.getBool(_kOnboardingSeen) ?? false;
  Future<void> setOnboardingSeen(bool value) =>
      _prefs.setBool(_kOnboardingSeen, value);

  /// Where the student was when the app was last backgrounded, so a cold start
  /// after the OS evicted the process returns them to the lesson they were on
  /// instead of to the dashboard.
  String? get lastRoute => _prefs.getString(_kLastRoute);
  Future<void> setLastRoute(String value) =>
      _prefs.setString(_kLastRoute, value);

  /// When the notification permission sheet was last shown.
  ///
  /// iOS only lets an app ask ONCE; after a refusal the request returns
  /// immediately with no prompt, so asking again is silent and pointless. This
  /// records the ask so the app can show its own explainer and deep-link to
  /// Settings instead of firing a dead request.
  DateTime? get pushPromptedAt {
    final raw = _prefs.getInt(_kPushPromptedAt);
    return raw == null ? null : DateTime.fromMillisecondsSinceEpoch(raw);
  }

  Future<void> setPushPromptedAt(DateTime value) =>
      _prefs.setInt(_kPushPromptedAt, value.millisecondsSinceEpoch);

  /// Everything except the theme and the language.
  ///
  /// Called on sign-out. Keeping those two is deliberate: a student who signs
  /// out should not have the app change colour and language on them.
  Future<void> clearSession() async {
    await _prefs.remove(_kOnboardingSeen);
    await _prefs.remove(_kLastRoute);
    await _prefs.remove(_kPushPromptedAt);
  }
}
