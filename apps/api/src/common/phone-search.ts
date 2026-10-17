import { toAsciiDigits } from '@ayman/contracts/phone';

/**
 * The digits of a PARTIAL phone number, in the form `users.phone_number`
 * stores them — or `null` when the search is not a phone search at all.
 *
 * `normalizeEgyptianPhone` parses a WHOLE number and answers `null` for
 * anything shorter, so a box searched one digit at a time would match nothing
 * until the last keystroke. This keeps the digits and drops the country code
 * or trunk zero the admin may or may not have typed: `01015186`, `+201015186`
 * and `201015186` all become `1015186`, a substring of the stored
 * `+201015186…` in every case. Arabic-Indic digits are folded first — a number
 * typed on an Egyptian keyboard is «٠١٠١٥١٨٦».
 *
 * Below three digits it answers `null`: one or two digits occur inside every
 * number in the table, and a search the admin is using to NARROW would match
 * everyone.
 *
 * The same rule `BookOrdersService` applies to its own search box (its copy is
 * private to that file, which predates this one).
 */
export function phoneSearchDigits(value: string): string | null {
  const digits = toAsciiDigits(value).replace(/\D/g, '');
  const local = digits.startsWith('20') ? digits.slice(2) : digits.replace(/^0+/, '');
  return local.length >= 3 ? local : null;
}
