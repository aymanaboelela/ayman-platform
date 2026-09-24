import { toAsciiDigits } from '@ayman/contracts/phone';

/**
 * A price field's text, read as EGP cents — and told apart from a typo.
 *
 * Every price field in the course editor used `Number(text)` and mapped
 * anything it could not read to `null`, and `null` is «مش للبيع». So a price
 * typed on an Egyptian keyboard — «٢٥٠», which is what that keyboard produces
 * — parsed as `NaN`, saved as «مش للبيع», and the indicator said «اتحفظ» while
 * the plan quietly came off sale.
 *
 * Three answers, not two, because the third is the whole point:
 *   - `empty`   — the field is blank: «مش للبيع», on purpose;
 *   - `valid`   — whole or decimal pounds, Arabic-Indic digits folded to Latin;
 *   - `invalid` — anything else; the caller must NOT save it.
 */
export type ParsedPounds =
  | { kind: 'empty' }
  | { kind: 'valid'; cents: number }
  | { kind: 'invalid' };

export function parsePounds(text: string): ParsedPounds {
  // «٫» is the Arabic decimal separator; «،» never is, so it stays invalid.
  const trimmed = toAsciiDigits(text).replace('٫', '.').trim();
  if (trimmed === '') return { kind: 'empty' };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { kind: 'invalid' };
  return { kind: 'valid', cents: Math.round(Number(trimmed) * 100) };
}

/** Cents back to the pounds a field shows. `null` is the empty field. */
export function poundsOf(cents: number | null): string {
  return cents === null ? '' : String(cents / 100);
}
