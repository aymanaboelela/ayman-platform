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
