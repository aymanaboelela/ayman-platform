/**
 * Text a person typed, kept in THIS tab until the server has it — so the
 * reload that fixes a stale tab does not cost them the paragraph.
 *
 * ## The case it exists for
 *
 * A deploy lands while an editor is writing (`lib/build-watch.ts`); the next
 * autosave fails because the tab's Server Action id no longer exists, and the
 * only cure is a document load (`lib/stale-deploy.ts`). The load discards
 * React state, and the text had never reached the server — so pressing
 * «تحديث دلوقتي» used to throw away exactly the words the toast was trying to
 * save.
 *
 * ## The contract, for any field that adopts it
 *
 *   · WRITE on every change;
 *   · CLEAR when a save of that same value has landed (compare, because an
 *     autosave that lands while newer text is still pending must not wipe the
 *     newer text);
 *   · READ once on mount, after hydration, and prefer it to the server's value
 *     only when it differs — it can only still exist if the save never landed.
 *
 * ## Why `sessionStorage`
 *
 * Per tab, and gone when the tab closes: it survives exactly the reload it is
 * for and nothing longer. `use-onboarding-draft.ts` makes the same choice for a
 * more sensitive payload and argues it at length. Keyed by the page's pathname
 * and a field name the caller chooses, so two lessons on one page are two
 * slots and the same lesson on another page is not a collision.
 *
 * Every access is wrapped: Safari's private mode throws on `setItem`, and a
 * draft that cannot be kept is the behaviour before this file existed — never
 * a reason for the field itself to break.
 */
const PREFIX = 'ayman:draft:';

function slot(field: string): string {
  return `${PREFIX}${window.location.pathname}:${field}`;
}

export function readDraft(field: string): string | null {
  try {
    return window.sessionStorage.getItem(slot(field));
  } catch {
    return null;
  }
}

export function writeDraft(field: string, value: string): void {
  try {
    window.sessionStorage.setItem(slot(field), value);
  } catch {
    // Nowhere to keep it; the field works exactly as it did before.
  }
}

export function clearDraft(field: string): void {
  try {
    window.sessionStorage.removeItem(slot(field));
  } catch {
    // Same.
  }
}
