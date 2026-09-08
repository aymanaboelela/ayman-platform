import 'package:flutter/widgets.dart';

/// Which languages exist, and which one the app is actually allowed to be in.
///
/// ## The switch is BUILT and deliberately NOT ENABLED
///
/// Everything for English is in place: `assets/translations/en.json` carries
/// every key the Arabic bundle does, the type scale has Latin line-heights,
/// and every widget uses directional insets so an LTR layout would lay out
/// correctly. What is NOT in place is the translation — `en.json` holds Arabic
/// values as placeholders — and the CONTENT is Arabic regardless: the courses,
/// the lessons, the exam questions and the instructor's replies are all in
/// Arabic and are not going to be translated.
///
/// So an app that switched to English would show English chrome around Arabic
/// content, which is worse than either. [enabled] is the single flag that turns
/// it on, and it stays false until `en.json` is genuinely translated.
abstract final class AppLocales {
  static const arabic = Locale('ar');
  static const english = Locale('en');

  /// What `EasyLocalization` is told exists.
  ///
  /// Both, even though only one is reachable — dropping English here would
  /// make the asset bundle unloadable and the switch untestable, and the point
  /// of building it now is that turning it on later is a translation job
  /// rather than an engineering one.
  static const supported = <Locale>[arabic, english];

  static const fallback = arabic;

  static const path = 'assets/translations';

  /// ⚠️ Flip to `true` ONLY when `assets/translations/en.json` is really
  /// English. See the class docs.
  static const enabled = false;

  /// The locale the app will use, whatever the device says.
  ///
  /// `startLocale` on EasyLocalization, so a phone set to English still opens
  /// in Arabic. Without it the app would come up in a language it does not
  /// speak on a large share of devices — Egyptian students very often run
  /// their phone in English.
  static Locale get start => arabic;

  static bool isRtl(Locale locale) => locale.languageCode == 'ar';
}
