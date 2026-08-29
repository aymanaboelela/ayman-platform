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

function keyFor(courseId: string): string {
  return `${KEY_PREFIX}${courseId}`;
}

/** The order id this browser remembers as in-progress for `courseId`, or `null`. */
export function readInProgressBookOrder(courseId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(keyFor(courseId));
  } catch {
    return null;
  }
}

/** Called once the address step succeeds — before payment exists. */
export function saveInProgressBookOrder(courseId: string, orderId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(courseId), orderId);
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
export function clearInProgressBookOrder(courseId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(courseId));
  } catch {
    /* Nothing to clean up if storage is unavailable. */
  }
}
