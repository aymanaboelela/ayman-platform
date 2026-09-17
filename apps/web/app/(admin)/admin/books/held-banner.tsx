'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { clearBookOrderHoldAction } from './actions';

const c = copy.admin.books;

/**
 * «محجوز للمراجعة» — the band on an order whose receipt needs a human.
 *
 * ## Why a band and not a chip
 *
 * The chip beside the status says WHAT; this says what to do about it. A held
 * order is missing from the packing list and skipped by the bulk «اتشحن», and
 * an order that quietly disappears from a print run with only a small word on
 * it to explain is a parcel that looks lost. The band is the size of the
 * consequence.
 *
 * ## Why the two numbers are printed
 *
 * «قريت ٢٥٠ والمطلوب ٣١٥» is the entire decision, and making the admin open the
 * screenshot to learn the first number is making them do the machine's work
 * twice. The screenshot is still one click away for the case where the reading
 * itself is what looks wrong.
 *
 * ⚠️ The amount is only ever shown, never enforced — the platform holds an
 * order when the receipt reads SHORT and never when it simply cannot be read.
 * See `readReceiptAfterwards`.
 */
export function HeldBanner({
  id,
  reason,
  readCents,
  owedCents,
}: {
  id: string;
  reason: string | null;
  /** What the OCR read off the screenshot, or null when it could not. */
  readCents: number | null;
  owedCents: number;
}) {
  const [working, setWorking] = useState(false);

  async function clear() {
    setWorking(true);
    const result = await clearBookOrderHoldAction(id);
    setWorking(false);
    toast[result.ok ? 'success' : 'error'](result.ok ? c.reviewOkDone : c.reviewOkFailed);
  }

  const why =
    reason === 'duplicate_receipt' ? c.heldDuplicateReceipt : c.heldAmountShort;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2"
      style={{
        borderColor: 'color-mix(in oklch, var(--warn), transparent 55%)',
        background: 'color-mix(in oklch, var(--warn), transparent 92%)',
      }}
    >
      <span className="text-[length:var(--fs-text-sm)] font-semibold" style={{ color: 'var(--warn)' }}>
        {c.heldBadge}
      </span>
      <span className="text-[length:var(--fs-text-sm)] text-fg">{why}</span>

      {/* Only for the short-amount case: on a duplicate receipt the two numbers
          agree and printing them would be noise beside the reason that matters. */}
      {reason !== 'duplicate_receipt' && readCents !== null ? (
        <span className="text-[length:var(--fs-text-xs)] tabular-nums text-fg-muted">
          {formatCopy(c.heldAmounts, {
            read: String(Math.round(readCents / 100)),
            owed: String(Math.round(owedCents / 100)),
          })}
        </span>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={working}
        onClick={() => void clear()}
        className="ms-auto"
      >
        {working ? c.reviewOkWorking : c.reviewOk}
      </Button>
    </div>
  );
}
