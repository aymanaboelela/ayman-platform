/**
 * حد الأجهزة — the numbers, in their own leaf.
 *
 * `DEFAULT_MAX_DEVICES` is what an account with no override gets («آخره
 * two devices»); `users.max_devices` is that override, NULL for everyone the
 * instructor has not touched. The API gate (`auth/device-limit.ts`), the admin
 * route that writes the override and the card that shows it all read these,
 * so «مسموح له بـ ٣» on the screen is the number the gate counts to.
 *
 * ⚠️ A NEW module rather than three more exports on `sessions.ts`, and the
 * reason is a deploy: Turbopack derives a client module's id from its path and
 * keeps the FIRST factory registered for it, so a tab that outlived the deploy
 * would hand the new devices card the old `sessions.ts` — where
 * `effectiveMaxDevices` is `undefined` and calling it kills the page. A path
 * that did not exist before cannot be pinned. (`zod-exports-only-z.spec.ts`
 * has the full account.)
 *
 * No Zod here and no imports at all, so the client card can take it without
 * dragging a schema into its bundle.
 *
 * The range is also the table's own CHECK (`users_max_devices_range`) — if
 * one of these moves, that migration has to move with it.
 */
export const DEFAULT_MAX_DEVICES = 2;
export const DEVICE_LIMIT_FLOOR = 1;
export const DEVICE_LIMIT_CEILING = 10;

/**
 * The limit that actually applies to an account.
 *
 * Anything outside the range falls back to the default rather than being
 * clamped: the column's CHECK means an out-of-range value can only come from
 * a hand edit, and a hand edit that produced `0` must not become a silent
 * second ban.
 */
export function effectiveMaxDevices(override: number | null | undefined): number {
  if (
    typeof override === 'number' &&
    Number.isInteger(override) &&
    override >= DEVICE_LIMIT_FLOOR &&
    override <= DEVICE_LIMIT_CEILING
  ) {
    return override;
  }
  return DEFAULT_MAX_DEVICES;
}
