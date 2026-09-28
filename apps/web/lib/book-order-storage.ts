/**
 * «لو قفلت التاب أرجع ألاقيها» — a guest's in-progress book order, remembered
 * on THIS browser only.
 *
 * Guest checkout (see `BookOrderButton`'s own docblock) means a visitor who
 * finishes the address step but closes the tab before paying has nothing
 * tying that order to them except the order's own id — no account, no
 * session. Without this, reopening the panel for the same course would start
 * the address form over from nothing, even though a real `BookOrder` row
 * (`status: 'address_only'`) already exists server-side.
 *
 * `localStorage`, not `sessionStorage`: the whole point is surviving a closed
 * tab/browser, which `sessionStorage` does not. The value stored is an
 * opaque order id (a UUID) plus the course it belongs to (via the key
 * itself) — never a name, phone, or address, so there is nothing sensitive
 * sitting in browser storage the way `use-onboarding-draft.ts` has to reason
 * about for its own (much more sensitive) draft.
 *
 * One key per course (`book-order:{courseId}`) rather than a single JSON blob
 * keyed by course: simpler to read/write/clear for the one course a mounted
 * `BookOrderPanel` actually cares about, and a stale entry for a course this
 * browser never revisits just sits there unread rather than needing its own
 * cleanup pass.
 *
 * Every operation is wrapped in `try/catch` and no-ops on the server or when
 * storage is blocked (private browsing, quota, site data disabled) — the
 * order still exists server-side either way; only the "resume on reopen"
 * convenience is lost, never the order itself.
 */

const KEY_PREFIX = 'ayman:book-order:';

/**
 * The scope «قسم الكتب»'s basket orders are remembered under.
 *
 * A basket is not "for" any one course — it may hold a first-year book and a
 * second-year one — so it cannot key on a course id. It is a single fixed scope
 * rather than one per basket because a second unfinished basket should REPLACE
 * the first: two of them is not a state a shop with one cart can be in, and
 * keying per basket would leave a key behind for every abandoned attempt.
 *
 * A course id is a UUID, so this string can never collide with one.
 */
export const CART_ORDER_KEY = 'cart';

function keyFor(scope: string): string {
  return `${KEY_PREFIX}${scope}`;
}

/**
 * The order id this browser remembers as in-progress for `scope` — a course id,
 * or `CART_ORDER_KEY` for the shop's basket — or `null`.
 */
export function readInProgressBookOrder(scope: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(keyFor(scope));
  } catch {
    return null;
  }
}

/** Called once the address step succeeds — before payment exists. */
export function saveInProgressBookOrder(scope: string, orderId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(scope), orderId);
  } catch {
    /* Quota or blocked storage — the order is already saved server-side;
       only this browser's "resume on reopen" convenience is lost. */
  }
}

/**
 * Called once payment is actually submitted successfully, and also when a
 * remembered id turns out to be stale (404, or already `paid`/`shipped`) —
 * either way there is nothing left worth resuming.
 */
export function clearInProgressBookOrder(scope: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(scope));
  } catch {
    /* Nothing to clean up if storage is unavailable. */
  }
}

/**
 * A basket, as one comparable string: `bookId:copies`, one per book, sorted.
 *
 * A string so the panel can hold it as an effect dependency — the `items` array
 * it is built from is a new object on every render of the shop.
 */
export function cartKeyOf(lines: readonly { bookId: string | null; quantity: number }[]): string {
  const copies = new Map<string, number>();
  for (const line of lines) {
    // A deleted book's line has no id; `''` matches no basket line, which is right.
    const id = line.bookId ?? '';
    copies.set(id, (copies.get(id) ?? 0) + line.quantity);
  }
  return [...copies]
    .map(([id, n]) => `${id}:${n}`)
    .sort()
    .join(',');
}

/**
 * Is the order remembered under `CART_ORDER_KEY` still the basket on screen?
 *
 * ⚠️ The key outlives the basket. It is ONE key however the basket changes, so
 * the order under it is the basket as it was when the address was given. A
 * student who gave an address for one copy, went back and made it two, then
 * pressed «اطلب» again was resumed straight onto the ONE-copy order: «×2» on
 * the line above, «الكتب ١٥٠ + الشحن ١٥٠ = ٣٠٠» in the box, and a transfer
 * made for that. Books and copies only — the prices are the order's own, frozen
 * when it was placed, and may differ from today's.
 */
export function orderMatchesCart(
  orderLines: readonly { bookId: string | null; quantity: number }[],
  cartKey: string,
): boolean {
  return cartKeyOf(orderLines) === cartKey;
}
