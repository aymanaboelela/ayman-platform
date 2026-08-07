/**
 * The only interpolation path for user-facing copy. Components must never
 * concatenate a copy string with a value — that reintroduces a user-facing
 * literal (a space, a comma, a unit) into a component, which is exactly what
 * Global Constraint 4 forbids.
 *
 * Unknown placeholders are left untouched rather than replaced with
 * "undefined", so a typo in a variable name is visible in the UI instead of
 * silently producing "undefined سؤال".
 */
export function formatCopy(
  template: string,
  vars: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match,
  );
}

/**
 * A mark, as a student should read it.
 *
 * `scaledScore` is a `Decimal(10,4)` in the database, so a paper worth 3 marks
 * scaled to 100 arrives as `66.6667` — and rendered raw, that is what a student
 * saw on their own result screen. Nobody's exam is out of 66.6667.
 *
 * Two decimals at most, and trailing zeros dropped, so a whole mark reads `75`
 * rather than `75.00` while a genuinely fractional one keeps its precision.
 * Rounding for DISPLAY only — every stored score and every pass/fail decision
 * still runs on the full value, so a 59.996 that fails does not render as a 60
 * that appears to have passed... which is why this rounds to two places rather
 * than to a whole number.
 */
export function formatMark(value: number): string {
  return String(Math.round(value * 100) / 100);
}
