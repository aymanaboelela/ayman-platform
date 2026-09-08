import 'package:phone_numbers_parser/phone_numbers_parser.dart';

/// The Egyptian phone number, normalised exactly the way the server does it.
///
/// ## Why this has to be reproduced client-side at all
///
/// The phone number IS the account identity in this product — it is the login
/// identifier, it is `@unique` in Postgres, and it is stored in E.164 and
/// compared byte-for-byte. The server normalises on its way in, so an app that
/// sent `٠١٠١٢٣٤٥٦٧٨` would still work. What it would NOT do is tell the
/// student, before they press the button, that what they typed is not a
/// number — and the sign-up error for that is a 400 whose message the student
/// reads as «الحساب مش راضي يتعمل».
///
/// So this exists to VALIDATE and to SHOW, not to be trusted: the server
/// normalises again regardless.
///
/// ## The Dart / TypeScript parity
///
/// The web uses `libphonenumber-js/core` with a 366-byte EG-only metadata blob
/// and requires `isValid() && country === 'EG'`. `phone_numbers_parser` is the
/// same underlying Google metadata, so the accept/reject set matches. The two
/// are pinned together by `test/unit/egyptian_phone_test.dart`, which carries
/// the same fixtures as `packages/contracts/src/phone.spec.ts`.
abstract final class EgyptianPhone {
  /// The message the server sends for a malformed number, verbatim.
  ///
  /// Not read from the copy bundle: this exact string is a CONSTANT in
  /// `packages/contracts/src/phone.ts` rather than an entry in the copy table,
  /// so there is no key to read. Kept identical so the client-side and
  /// server-side rejections are indistinguishable to a student.
  static const invalidMessage = 'رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا';

  /// Folds Arabic-Indic and Extended Arabic-Indic digits to ASCII.
  ///
  /// `U+0660–0669` (Arabic-Indic, the Egyptian keyboard's own digits) and
  /// `U+06F0–06F9` (Extended Arabic-Indic, which a Persian or Urdu keyboard
  /// layout produces). Everything else — `+`, spaces, dashes, the leading
  /// zero — passes through untouched.
  ///
  /// Applied PER KEYSTROKE in the phone field so the student sees what will
  /// actually be saved. It is one codepoint for one codepoint, which is what
  /// keeps the caret position valid while they type; a formatter that inserted
  /// or removed characters would send the cursor to the end of the field on
  /// every digit.
  static String toAsciiDigits(String value) {
    final buffer = StringBuffer();
    for (final rune in value.runes) {
      if (rune >= 0x0660 && rune <= 0x0669) {
        buffer.write(rune - 0x0660);
      } else if (rune >= 0x06F0 && rune <= 0x06F9) {
        buffer.write(rune - 0x06F0);
      } else {
        buffer.writeCharCode(rune);
      }
    }
    return buffer.toString();
  }

  /// The E.164 form (`+201012345678`), or null if it is not a valid Egyptian
  /// number.
  ///
  /// Accepts `01012345678`, `+201012345678`, `201012345678`, `٠١٠١٢٣٤٥٦٧٨`.
  /// Returns null rather than throwing, for anything else — including an empty
  /// string, a landline, and a valid number from another country. The
  /// country check is not redundant: `+15551234567` parses fine and is simply
  /// not an account this platform can have.
  static String? normalize(String value) {
    final trimmed = toAsciiDigits(value).trim();
    if (trimmed.isEmpty) return null;
    try {
      final parsed = PhoneNumber.parse(trimmed, callerCountry: IsoCode.EG);
      if (!parsed.isValid() || parsed.isoCode != IsoCode.EG) return null;
      return '+${parsed.countryCode}${parsed.nsn}';
    } catch (_) {
      // The parser throws on input it cannot even tokenise. A student halfway
      // through typing is in that state on almost every keystroke, so this is
      // the normal path, not an error path.
      return null;
    }
  }

  static bool isValid(String value) => normalize(value) != null;

  /// Which endpoint a login identifier belongs to.
  ///
  /// ⚠️ The `@` test runs FIRST and that ordering is load-bearing.
  /// `libphonenumber` reads `201012345678@phone.invalid` as the valid number
  /// `+201012345678`, so checking the phone first would route an email at the
  /// placeholder domain to the phone endpoint.
  ///
  /// Unparseable input goes to the EMAIL endpoint on purpose: a typo then
  /// earns the same generic 401 as any other wrong credential, instead of a
  /// distinguishable "that is not a phone number" that would let someone
  /// enumerate which identifiers exist.
  static LoginIdentifier resolveLoginIdentifier(String identifier) {
    final trimmed = identifier.trim();
    if (trimmed.contains('@')) {
      return LoginIdentifier(kind: LoginIdentifierKind.email, value: trimmed);
    }
    final phone = normalize(trimmed);
    if (phone != null) {
      return LoginIdentifier(kind: LoginIdentifierKind.phone, value: phone);
    }
    return LoginIdentifier(kind: LoginIdentifierKind.email, value: trimmed);
  }
}

enum LoginIdentifierKind { email, phone }

class LoginIdentifier {
  const LoginIdentifier({required this.kind, required this.value});

  final LoginIdentifierKind kind;

  /// Already normalised for [LoginIdentifierKind.phone]; trimmed only for
  /// email.
  final String value;
}
