// ⚠️ `hide TextDirection`. easy_localization re-exports `intl`, whose
// `TextDirection` is a CLASS with `LTR`/`RTL` constants — a different type
// entirely from `dart:ui`'s enum that `TextField.textDirection` takes. Without
// the hide, `TextDirection.ltr` fails to resolve and the analyzer blames the
// getter rather than the import.
import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../localization/copy_keys.dart';
import 'app_text_field.dart';

/// The Egyptian phone field — the account identity, not a profile detail.
///
/// `auth.md` §3, "the single most important rule": every account is keyed on
/// the number in E.164 (`+201012345678`), Better Auth looks the account up by
/// **exact string equality**, and there is no account recovery. A student who
/// registers as `+201012345678` and signs in as `01012345678` is told they
/// have no account, and nothing anywhere logs an error.
///
/// So the same normalisation the server runs also runs here — see
/// [EgyptianPhone], which is a hand port of `packages/contracts/src/phone.ts`
/// verified against `libphonenumber-js@1.13.9` + `EG_METADATA` over the whole
/// input space it can reach. Client-side normalisation is not a substitute for
/// the server hook; it is what stops the student being told their own number
/// is wrong AFTER they have filled in four other fields.
///
/// ## The two things that make this field different from a text field
///
/// **Digits fold as they are typed.** An Egyptian Android keyboard produces
/// ٠١٢, and the number is stored in Latin digits. The parser has always folded
/// them, so acceptance never depended on this — what depended on it is whether
/// the student can SEE that. They type on the keyboard their phone gives them,
/// watch ٠١٠ appear in a field whose placeholder reads `01012345678`, and have
/// no way to know the two are the same number. Some clear it and try again;
/// some leave.
///
/// **The number is laid out LTR inside an RTL form.** A phone number is a
/// Latin string. Rendered RTL, a pasted `+201…` puts its `+` at the far end,
/// which is a different number to read. Only the box is flipped —
/// [AppTextField] scopes the [Directionality] to the field — so the label
/// above and any error below stay Arabic and right-aligned.
class AppPhoneField extends StatelessWidget {
  const AppPhoneField({
    this.label,
    this.isRequired = false,
    this.controller,
    this.focusNode,
    this.hintText,
    this.helperText,
    this.errorText,
    this.textInputAction,
    this.enabled = true,
    this.autofocus = false,
    this.autofillHints = const [AutofillHints.telephoneNumber],
    this.onChanged,
    this.onSubmitted,
    super.key,
  });

  /// Defaults to «رقم الموبايل». Pass one for the guardian numbers on the
  /// onboarding wizard ([CopyKeys.onboardingFatherPhone] and friends) or for
  /// the InstaPay sender number in the admin.
  final String? label;

  final bool isRequired;
  final TextEditingController? controller;
  final FocusNode? focusNode;

  /// Defaults to the example number the web shows, `01012345678` — the form
  /// the student is expected to type, leading zero and all.
  final String? hintText;

  final String? helperText;

  /// The one Arabic message the server uses for a malformed number is
  /// «رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا». Validate with
  /// [EgyptianPhone.normalize] and pass that message through; do NOT invent a
  /// second wording, or the field and the API will disagree about the same
  /// number.
  final String? errorText;

  final TextInputAction? textInputAction;
  final bool enabled;
  final bool autofocus;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return AppTextField(
      label: label ?? tr(CopyKeys.authFieldsPhone),
      isRequired: isRequired,
      controller: controller,
      focusNode: focusNode,
      hintText: hintText ?? tr(CopyKeys.authFieldsPhonePlaceholder),
      helperText: helperText,
      errorText: errorText,
      textInputAction: textInputAction,
      enabled: enabled,
      autofocus: autofocus,
      autofillHints: autofillHints,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      keyboardType: TextInputType.phone,
      // A number is not prose, and on an Arabic locale the keyboard will
      // happily "correct" a digit run into something else entirely.
      autocorrect: false,
      enableSuggestions: false,
      textDirection: TextDirection.ltr,
      inputFormatters: const [ArabicIndicDigitsFormatter()],
    );
  }
}

/// Rewrites Arabic-Indic and Persian digits to ASCII on every keystroke, and
/// touches nothing else.
///
/// Lives beside [AppPhoneField] because the inputs folder is a fixed,
/// enumerated set — and because the two belong together: a phone field without
/// this formatter looks identical and is subtly broken.
///
/// ## Why the caret survives
///
/// The replacement is one codepoint for one codepoint, and every digit
/// involved — Arabic-Indic `U+0660–0669`, Extended Arabic-Indic
/// `U+06F0–06F9`, ASCII `0–9` — is in the BMP, so each is a single UTF-16 code
/// unit. The string length therefore never changes and the incoming
/// [TextEditingValue.selection] and `composing` offsets stay valid, including
/// for a mid-string edit or a paste. Rebuilding them by hand is what usually
/// breaks these formatters.
///
/// The value is returned UNCHANGED when nothing folded. Handing back an
/// equal-but-new [TextEditingValue] on every keystroke makes the engine
/// re-send the whole editing state to the platform, which on some Android
/// IMEs drops the composing region and kills predictive input mid-word.
class ArabicIndicDigitsFormatter extends TextInputFormatter {
  const ArabicIndicDigitsFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final folded = EgyptianPhone.toAsciiDigits(newValue.text);
    if (folded == newValue.text) return newValue;
    return newValue.copyWith(text: folded);
  }
}

/// The Egyptian phone parser, ported from `packages/contracts/src/phone.ts`.
///
/// ## Why it is hand-written
///
/// The web calls `libphonenumber-js/core` with a 366-byte EG-only metadata
/// blob. There is no Dart binding to that blob, and the two Flutter packages
/// that wrap libphonenumber either ship the full 245-country dataset or bind
/// to a platform library whose version nobody controls — either way the client
/// could start disagreeing with the server about what a valid number is, which
/// is precisely the failure this file exists to prevent.
///
/// So the rules are transcribed instead, from the blob itself:
///
/// * calling code `20`, IDD prefix `00`, national prefix `0`
/// * the general national-number pattern `[189]\d{8,9}|[24-6]\d{8}|[135]\d{7}`
/// * possible lengths 8, 9, 10 (implied by the pattern above)
///
/// The `min` metadata build carries no per-type patterns, so
/// `PhoneNumber.isValid()` in the web's build is exactly "matches the general
/// pattern" — which is what [_general] is. This port was diff-tested against
/// `libphonenumber-js@1.13.9` driven by that same blob across ~140,000 inputs
/// (national, `+20`, `0020`, bare-`20`, punctuated, over- and under-length,
/// Arabic-Indic and Persian digits) with zero disagreements, and it reproduces
/// every case pinned in `phone.spec.ts`.
///
/// ⚠️ If `libphonenumber-js` is bumped and `eg-metadata.ts` is regenerated,
/// [_general] here has to be regenerated with it. Egypt has added mobile
/// prefixes before, and a stale pattern rejects a whole network's customers
/// while every other case still passes.
abstract final class EgyptianPhone {
  /// `[189]\d{8,9}|[24-6]\d{8}|[135]\d{7}` — the country's general national
  /// number pattern, anchored. `01012345678` reaches it as `1012345678`.
  static final RegExp _general = RegExp(
    r'^(?:[189]\d{8,9}|[24-6]\d{8}|[135]\d{7})$',
  );

  /// Everything that is not a digit and not a `+`. Spaces, dashes, brackets
  /// and dots are how people group a number on paper, and libphonenumber
  /// strips them before it looks at anything.
  static final RegExp _noise = RegExp(r'[^\d+]');

  /// Arabic-Indic `U+0660–0669` and Extended Arabic-Indic `U+06F0–06F9`.
  static final RegExp _easternDigits = RegExp('[٠-٩۰-۹]');

  /// ٠١٢٣٤٥٦٧٨٩ → 0123456789, and the Persian shapes ۰۱۲۳۴۵۶۷۸۹ with them.
  ///
  /// The two blocks are handled separately and deliberately: Arabic-Indic
  /// (`U+0660–0669`) is what an Egyptian Android keyboard produces, Extended
  /// Arabic-Indic (`U+06F0–06F9`) is the Persian/Urdu set — visually
  /// near-identical for several digits, a different codepoint for every one of
  /// them, and reachable from keyboards students genuinely have installed. A
  /// single range would silently miss half of them.
  ///
  /// Everything else passes through untouched, so `+`, spaces and the leading
  /// zero survive exactly as typed.
  static String toAsciiDigits(String value) {
    return value.replaceAllMapped(_easternDigits, (match) {
      final code = match.input.codeUnitAt(match.start);
      final base = code >= 0x06F0 ? 0x06F0 : 0x0660;
      return String.fromCharCode(0x30 + code - base);
    });
  }

  /// The E.164 form (`+201012345678`), or null. Never throws, and carries no
  /// message — the caller pairs it with the server's own wording.
  ///
  /// Accepts every shape an Egyptian actually types: `01012345678`,
  /// `+201012345678`, `00201012345678`, `010 1234 5678`, `٠١٠١٢٣٤٥٦٧٨`, the
  /// bare `201012345678` off a contact card, and a Cairo landline
  /// `0223456789` — a parent's number on the onboarding wizard is often one.
  static String? normalize(String value) {
    // Grouping characters go first, so that a `+` written as `(+20)` is still
    // recognised as the leading one. Then the `+` itself: from here on only
    // the digits matter, and keeping the sign would make `01+0123…` — a real
    // fat-finger on a phone keypad — fail a pattern it should pass.
    final compact = toAsciiDigits(value).trim().replaceAll(_noise, '');
    final digits = compact.replaceAll('+', '');
    if (digits.isEmpty) return null;

    // A leading `+` or the `00` IDD prefix both promise a country code, so the
    // next two digits MUST be Egypt's. This is the branch that rejects
    // `+966…`: on the web those throw `INVALID_COUNTRY` because the calling
    // code is not in the 366-byte blob at all, and land in the same `catch`
    // that produces the same one message. The student must not be able to tell
    // the two branches apart.
    if (compact.startsWith('+') || digits.startsWith('00')) {
      final afterIdd = compact.startsWith('+') ? digits : digits.substring(2);
      if (!afterIdd.startsWith('20')) return null;
      final rest = afterIdd.substring(2);
      // `+2001012345678` is real: a country code followed by a number that
      // still carries its national prefix. libphonenumber strips the `0`
      // after the calling code too, so this does.
      return _accept(rest) ?? _accept(_withoutLeading(rest, '0'));
    }

    // No country code claimed. Try the number as it stands, then as a national
    // number with its `0`, then as an international number that lost its `+`
    // — in that order, which is the order libphonenumber resolves them in.
    return _accept(digits) ??
        _accept(_withoutLeading(digits, '0')) ??
        _accept(_withoutLeading(digits, '20')) ??
        _accept(_withoutLeading(digits, '200'));
  }

  /// True when [normalize] would return a number. A convenience for a form
  /// that only needs the verdict.
  static bool isValid(String value) => normalize(value) != null;

  static String? _accept(String? national) {
    if (national == null || !_general.hasMatch(national)) return null;
    return '+20$national';
  }

  static String? _withoutLeading(String value, String prefix) =>
      value.startsWith(prefix) ? value.substring(prefix.length) : null;
}
