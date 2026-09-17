'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Textarea } from '@ayman/ui/components/textarea';
import { dismissTransferAction, ingestTransfersAction } from './actions';

const c = copy.admin.transfers;

/** One row's «اقفلها». Rendered only for a row that is neither matched nor
 *  already closed — the other two have nothing left to decide. */
export function DismissTransferButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await dismissTransferAction(id);
        setBusy(false);
        if (result.ok) toast.success(copy.admin.common.saved);
        else toast.error(c.actionFailed);
      }}
    >
      {c.dismiss}
    </Button>
  );
}

/**
 * The paste box.
 *
 * Clears itself on success, because the counts in the toast are the receipt
 * and leaving the text behind invites the same paste twice — which the ledger
 * would dedupe, but only after telling the admin it read five transfers and
 * created none, which reads like a failure.
 */
export function IngestTransfersBox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface-2 p-4">
      <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.pasteTitle}</h2>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.pasteHint}</p>
      <Textarea
        dir="auto"
        rows={5}
        className="mt-3"
        placeholder={c.pastePlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={busy}
      />
      <Button
        type="button"
        className="mt-3"
        disabled={busy || text.trim() === ''}
        onClick={async () => {
          setBusy(true);
          const outcome = await ingestTransfersAction(text);
          setBusy(false);
          if (!outcome.ok) {
            toast.error(c.actionFailed);
            return;
          }
          setText('');
          toast.success(
            formatCopy(c.pasteResult, {
              read: outcome.result.read,
              created: outcome.result.created,
              matched: outcome.result.matched,
              duplicates: outcome.result.duplicates,
              unreadable: outcome.result.unreadable,
            }),
          );
        }}
      >
        {c.pasteSubmit}
      </Button>
    </section>
  );
}
