/**
 * A counted noun the way it is said: «محاضرة واحدة»، «محاضرتين»، «٣ محاضرات»،
 * «١١ محاضرة». A single `'{count} محاضرة'` string read «3 محاضرة» on every
 * month card of the new checkout, which is how nobody says it.
 *
 * Arabic picks the noun's form from the number: one and two have their own
 * words, 3–10 take the plural, and 11 upward go back to the singular — by the
 * last two digits, so 103 is «١٠٣ محاضرات» and 111 is «١١١ محاضرة».
 *
 * Its own module on purpose: a new export on an existing contracts module
 * breaks every tab still open on the previous build (Turbopack module ids).
 */
export interface ArabicCountForms {
  one: string;
  two: string;
  /** `{count}` — 3–10 (by the last two digits). */
  few: string;
  /** `{count}` — 0 and 11 upward. */
  many: string;
}

export function arabicCount(count: number, forms: ArabicCountForms): string {
  const tail = Math.abs(count) % 100;
  const form =
    count === 1 ? forms.one : count === 2 ? forms.two : tail >= 3 && tail <= 10 ? forms.few : forms.many;
  return form.replace('{count}', String(count));
}
