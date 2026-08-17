/**
 * `https://wa.me/<digits>` — the one way this product opens WhatsApp at a
 * person.
 *
 * ## Why it is its own module and not a line in `phone.ts`
 *
 * `phone.ts` pulls `libphonenumber-js/core`, `EG_METADATA` and Zod. One of the
 * five callers of this function is `assistant-widget.tsx`, which is mounted on
 * every route in the product and whose file header is a standing argument
 * against exactly that: it imports `@ayman/contracts/assistant/summary` rather
 * than the schema-bearing sibling, and takes `ConversationThread` as a
 * TYPE-only import, precisely so no parser lands in the bundle that draws a
 * floating button. Putting the helper in `phone.ts` would undo that with an
 * import nobody would think to question.
 *
 * So this file has NO imports at all. Everything it is handed is already E.164
 * — `ContactSchema.whatsapp` validates that shape, `User.phoneNumber` is
 * normalised in a Better Auth `before` hook, and a guest's number went through
 * `egyptianPhone()` before it was stored — which means the parser was never
 * the part that was needed here. Stripping one character was.
 *
 * ## The `+` has to go
 *
 * `wa.me` takes the number WITHOUT it: `https://wa.me/+2010…` lands on
 * WhatsApp's «phone number shared via url is invalid» page rather than on a
 * chat. That strip is the entire conversion, and it was an inlined one-liner
 * in three components — the footer, the links page and المساعد's widget — each
 * carrying a comment naming the other two. The inbox and the student record
 * are the fourth and fifth, which is one more than a comment can hold together.
 */

/** E.164: a `+`, a non-zero country digit, then 7–14 more. */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * A `wa.me` link for a stored number, or `null` when there is no number to
 * link to.
 *
 * Nullable in and nullable out, so a caller writes
 * `const href = waMeHref(phone)` and renders the button only when there is
 * somewhere for it to go. The alternative — a link to `https://wa.me/` with no
 * number — is not a degraded button, it is a button that opens WhatsApp's
 * marketing page, and shipping one is a bug this product has already had once
 * (see the footer's own note).
 */
export function waMeHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!E164.test(trimmed)) return null;
  return `https://wa.me/${trimmed.slice(1)}`;
}
