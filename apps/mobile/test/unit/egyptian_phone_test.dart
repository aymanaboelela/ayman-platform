import 'package:ayman_mobile/core/functions/egyptian_phone.dart';
import 'package:flutter_test/flutter_test.dart';

/// Pins the Dart normaliser to the TypeScript one.
///
/// The fixtures are the same cases `packages/contracts/src/phone.spec.ts`
/// covers. They are not decoration: the phone number is the account identity,
/// it is `@unique` in Postgres and compared byte-for-byte, so a normaliser that
/// disagrees with the server by one character produces a student who can create
/// an account and then cannot sign into it.
void main() {
  group('toAsciiDigits', () {
    test('folds Arabic-Indic digits', () {
      // U+0660–0669 — what an Egyptian keyboard actually produces.
      expect(EgyptianPhone.toAsciiDigits('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
    });

    test('folds Extended Arabic-Indic digits', () {
      // U+06F0–06F9 — a Persian or Urdu layout. Rare, but the server folds
      // them, so the field must show the same thing the server will store.
      expect(EgyptianPhone.toAsciiDigits('۰۱۰۱۲۳۴۵۶۷۸'), '01012345678');
    });

    test('leaves everything else untouched', () {
      // `+`, spaces and the leading zero all pass through — the fold is one
      // codepoint for one codepoint, which is what keeps the caret valid while
      // the student types.
      expect(EgyptianPhone.toAsciiDigits('+20 10 ١٢٣٤٥٦٧٨'), '+20 10 12345678');
    });

    test('is a no-op on ASCII', () {
      expect(EgyptianPhone.toAsciiDigits('01012345678'), '01012345678');
    });
  });

  group('normalize', () {
    test('accepts the local form', () {
      expect(EgyptianPhone.normalize('01012345678'), '+201012345678');
    });

    test('accepts E.164', () {
      expect(EgyptianPhone.normalize('+201012345678'), '+201012345678');
    });

    test('accepts the country code without a plus', () {
      expect(EgyptianPhone.normalize('201012345678'), '+201012345678');
    });

    test('accepts Arabic-Indic digits', () {
      expect(EgyptianPhone.normalize('٠١٠١٢٣٤٥٦٧٨'), '+201012345678');
    });

    test('tolerates spaces and dashes', () {
      expect(EgyptianPhone.normalize('010 1234 5678'), '+201012345678');
      expect(EgyptianPhone.normalize('010-1234-5678'), '+201012345678');
    });

    test('accepts every Egyptian mobile prefix', () {
      // 010 Vodafone · 011 Etisalat · 012 Orange · 015 WE. All four are in
      // use by students, and a normaliser that quietly rejected one would
      // lock out a whole carrier.
      //
      // Note the leading zero: E.164 DROPS it. `01012345678` becomes
      // `+201012345678`, not `+2001012345678` — the national significant
      // number is `1012345678`. Getting that wrong is the classic way a
      // hand-rolled normaliser produces numbers that never match a stored row.
      for (final prefix in ['010', '011', '012', '015']) {
        expect(
          EgyptianPhone.normalize('${prefix}12345678'),
          '+20${prefix.substring(1)}12345678',
          reason: 'prefix $prefix must be accepted',
        );
      }
    });

    test('returns null for an empty or blank string', () {
      expect(EgyptianPhone.normalize(''), isNull);
      expect(EgyptianPhone.normalize('   '), isNull);
    });

    test('returns null for a number that is too short', () {
      expect(EgyptianPhone.normalize('0101234'), isNull);
    });

    test('returns null for a non-Egyptian number', () {
      // Parses perfectly well and is simply not an account this platform can
      // have. The country check is not redundant with `isValid()`.
      expect(EgyptianPhone.normalize('+15551234567'), isNull);
      expect(EgyptianPhone.normalize('+966501234567'), isNull);
    });

    test('returns null rather than throwing on junk', () {
      // A student halfway through typing is in this state on almost every
      // keystroke, so it is the normal path.
      for (final junk in ['abc', '+', '++20', 'مرحبا', '0'.padRight(40, '0')]) {
        expect(EgyptianPhone.normalize(junk), isNull, reason: 'junk: $junk');
      }
    });
  });

  group('resolveLoginIdentifier', () {
    test('sends anything containing @ to the email endpoint', () {
      final result = EgyptianPhone.resolveLoginIdentifier('a@b.com');
      expect(result.kind, LoginIdentifierKind.email);
      expect(result.value, 'a@b.com');
    });

    test('⚠️ the @ test runs BEFORE the phone test', () {
      // libphonenumber reads `201012345678@phone.invalid` as the valid number
      // +201012345678. Checking the phone first would route a placeholder
      // email to the phone endpoint, where it would never match.
      final result = EgyptianPhone.resolveLoginIdentifier('201012345678@phone.invalid');
      expect(result.kind, LoginIdentifierKind.email);
      expect(result.value, '201012345678@phone.invalid');
    });

    test('sends a valid Egyptian number to the phone endpoint, normalised', () {
      final result = EgyptianPhone.resolveLoginIdentifier(' ٠١٠١٢٣٤٥٦٧٨ ');
      expect(result.kind, LoginIdentifierKind.phone);
      expect(result.value, '+201012345678');
    });

    test('sends unparseable input to the EMAIL endpoint', () {
      // Deliberate: a typo then earns the same generic 401 as any other wrong
      // credential, instead of a distinguishable "that is not a phone number"
      // that would let someone enumerate which identifiers exist.
      final result = EgyptianPhone.resolveLoginIdentifier('not-a-thing');
      expect(result.kind, LoginIdentifierKind.email);
    });

    test('trims before deciding', () {
      expect(
        EgyptianPhone.resolveLoginIdentifier('  a@b.com  ').value,
        'a@b.com',
      );
    });
  });
}
