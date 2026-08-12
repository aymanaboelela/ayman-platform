import { toast } from 'sonner';
import { copy } from '@ayman/contracts';

/**
 * Undo on a reversible destructive action.
 *
 * This is NOT a client-side delay that "cancels" a pending request — that
 * pattern loses the action entirely if the tab closes during the window, and
 * it cannot undo anything once the request has actually left. Instead the
 * destructive action is a SOFT delete (`archivedAt`) that has already
 * committed, and undo is a real restore call. The toast is a shortcut to the
 * restore, not a stay of execution.
 *
 * Consequence: every "delete" in this admin is `archive`, and hard deletion
 * is not offered in the UI at all (Task 13's media library is the reference
 * case).
 *
 * Its three labels come from `copy.common`, not `copy.admin.actions`, even
 * though every caller so far is an admin screen. This module sits in
 * `apps/web/lib`, so anything on the student side may import it, and a single
 * `copy.admin.*` read here would pull `@ayman/contracts/copy/admin` — the whole
 * course-builder string table — into whatever chunk that student route lands
 * in. `copy.admin.actions.undo`/`.undone` still exist, aliased to these.
 */
export async function toastUndoable({
  messageAr,
  perform,
  undo,
}: {
  messageAr: string;
  perform: () => Promise<void>;
  undo: () => Promise<void>;
}): Promise<void> {
  await perform();

  toast(messageAr, {
    duration: 8000,
    action: {
      label: copy.common.undo,
      onClick: () => {
        void undo().then(
          () => toast.success(copy.common.undone),
          () => toast.error(copy.common.error),
        );
      },
    },
  });
}
