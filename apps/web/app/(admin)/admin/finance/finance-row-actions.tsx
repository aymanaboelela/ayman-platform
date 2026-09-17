'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import type { AdminFinanceRow } from '@ayman/contracts/admin/finance';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import { Switch } from '@ayman/ui/components/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import {
  cancelFinanceSubscriptionAction,
  editFinanceAmountAction,
  editFinanceDatesAction,
} from './actions';

const c = copy.admin.finance;

/** `AdminFinanceRow.validFrom`/`.validUntil` are full ISO datetimes; a
 *  `<input type="date">` wants `YYYY-MM-DD`. Round-tripping through the
 *  submit handler (which turns the date back into a real ISO datetime) is
 *  fine here — the admin override is a calendar day, not a time of day. */
function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The three mutations `/admin/finance` has over a live subscription —
 * modelled on `PaymentReviewActions`' own dialog-plus-server-action shape.
 * One component per row rather than a page-level dialog: each row's own
 * current values (amount, dates, scope) seed the form the moment it opens.
 */
export function FinanceRowActions({ row }: { row: AdminFinanceRow }) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Displayed and edited in EGP (whole pounds, same as `formatEGP` shows
  // everywhere else on this page) — `saveAmount` below converts back to
  // cents, which is the unit `PaymentSubmission.amountCents` actually stores.
  const [amountPounds, setAmountPounds] = useState(String((row.amountCents ?? 0) / 100));
  const [isFree, setIsFree] = useState(row.isFree ?? false);
  const [savingAmount, setSavingAmount] = useState(false);

  const [validFrom, setValidFrom] = useState(toDateInputValue(row.validFrom));
  const [validUntil, setValidUntil] = useState(row.validUntil ? toDateInputValue(row.validUntil) : '');
  const [openEnded, setOpenEnded] = useState(row.validUntil === null);
  const [savingDates, setSavingDates] = useState(false);

  const [reason, setReason] = useState(row.cancelReason ?? '');
  const [showToStudent, setShowToStudent] = useState(row.cancelReasonVisibleToStudent);
  /*
   * «رجعتله فلوسه؟» — off by default, and that default is the whole point.
   *
   * Cancelling and refunding are two decisions: cutting a student off for
   * cheating keeps every pound, and only money that actually went back should
   * leave the totals. If the refund were implied by the cancel, every
   * disciplinary cut-off would quietly deflate «صافي الربح».
   *
   * The amount is held as the STRING the field contains, not as a number:
   * a controlled numeric input that coerces on every keystroke cannot be
   * cleared, and «٢٥» on the way to «٢٥٠» must not be rejected mid-typing.
   */
  const [refunding, setRefunding] = useState(false);
  const [refundPounds, setRefundPounds] = useState('');

  /*
   * The most that can come back: what this subscription collected, minus what
   * has already been given back.
   *
   * `amountCents` on the row is the LATEST payment, and `refundedCents` is
   * every refund ever recorded against the grant — so for a renewing
   * subscriber this understates the true cap, and the server holds the real
   * one (it can see every approved submission; the row carries only the last).
   * Understating is the right way round for a client-side hint: it never
   * blocks a refund the server would accept without also warning him, and it
   * never invites one the server will reject.
   *
   * A free/comped row has no money behind it, so the cap is zero and the
   * switch below has nothing to offer.
   */
  const maxRefundPounds = Math.max(
    0,
    Math.floor(((row.isFree ? 0 : (row.amountCents ?? 0)) - row.refundedCents) / 100),
  );
  const refundValue = Number(refundPounds);
  const refundIsValid =
    refundPounds.trim().length > 0 &&
    Number.isFinite(refundValue) &&
    refundValue > 0 &&
    refundValue <= maxRefundPounds;
  const [cancelling, setCancelling] = useState(false);

  async function saveAmount() {
    const parsed = Math.round(Number(amountPounds) * 100);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setSavingAmount(true);
    const result = await editFinanceAmountAction(row.id, parsed, isFree);
    setSavingAmount(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
    } else {
      toast.error(c.editFailed);
    }
  }

  async function saveDates() {
    setSavingDates(true);
    const result = await editFinanceDatesAction(
      row.id,
      new Date(validFrom).toISOString(),
      openEnded ? null : new Date(validUntil).toISOString(),
    );
    setSavingDates(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
    } else {
      toast.error(c.editFailed);
    }
  }

  async function confirmCancel() {
    if (reason.trim().length === 0) return;
    if (refunding && !refundIsValid) return;
    setCancelling(true);
    const result = await cancelFinanceSubscriptionAction(
      row.id,
      reason.trim(),
      showToStudent,
      // Pounds on screen, piastres on the wire — every amount in this codebase
      // crosses that boundary exactly once, at the edge that reads the input.
      refunding ? Math.round(Number(refundPounds) * 100) : null,
    );
    setCancelling(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      setCancelOpen(false);
    } else {
      toast.error(c.cancelFailed);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            {c.actionEdit}
          </Button>
        </DialogTrigger>
        <DialogContent closeLabel={c.editClose}>
          <DialogHeader>
            <DialogTitle>{c.editDialogTitle}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-sm border border-line-subtle p-3">
              <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.editAmountSection}</p>
              <Label htmlFor="edit-amount">{c.editAmountLabel}</Label>
              <Input
                id="edit-amount"
                type="number"
                min={0}
                step="0.01"
                value={amountPounds}
                onChange={(event) => setAmountPounds(event.target.value)}
              />
              <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
                <Switch checked={isFree} onCheckedChange={setIsFree} />
                {c.editIsFreeLabel}
              </label>
              <Button
                type="button"
                size="sm"
                onClick={saveAmount}
                disabled={savingAmount}
                className="self-start"
              >
                {savingAmount ? c.editAmountSaving : c.editAmountSave}
              </Button>
            </section>

            <section className="flex flex-col gap-2 rounded-sm border border-line-subtle p-3">
              <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.editDatesSection}</p>
              {row.scope === 'term' ? (
                <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.editDatesTermNotice}</p>
              ) : (
                <>
                  <Label htmlFor="edit-valid-from">{c.editValidFromLabel}</Label>
                  <Input
                    id="edit-valid-from"
                    type="date"
                    value={validFrom}
                    onChange={(event) => setValidFrom(event.target.value)}
                  />
                  <Label htmlFor="edit-valid-until">{c.editValidUntilLabel}</Label>
                  <Input
                    id="edit-valid-until"
                    type="date"
                    value={validUntil}
                    disabled={openEnded}
                    onChange={(event) => setValidUntil(event.target.value)}
                  />
                  <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
                    <Switch checked={openEnded} onCheckedChange={setOpenEnded} />
                    {c.editValidUntilOpenEnded}
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveDates}
                    disabled={savingDates || (!openEnded && validUntil.length === 0)}
                    className="self-start"
                  >
                    {savingDates ? c.editDatesSaving : c.editDatesSave}
                  </Button>
                </>
              )}
            </section>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
              {c.editClose}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="danger" size="sm">
            {c.actionCancel}
          </Button>
        </DialogTrigger>
        <DialogContent closeLabel={c.cancelBack}>
          <DialogHeader>
            <DialogTitle>{c.cancelDialogTitle}</DialogTitle>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.cancelReasonLabel}
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={c.cancelReasonPlaceholder}
              rows={3}
            />
          </label>
          <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
            <Switch checked={showToStudent} onCheckedChange={setShowToStudent} />
            {c.cancelShowToStudentLabel}
          </label>

          {/* The money half, behind its own switch. Two decisions, two
              controls — see the `refunding` state's own note. */}
          <div className="rounded-lg border border-line-subtle bg-surface-2 p-3">
            <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
              <Switch checked={refunding} onCheckedChange={setRefunding} />
              {c.cancelRefundLabel}
            </label>
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.cancelRefundHint}
            </p>
            {refunding ? (
              <label className="mt-2.5 flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
                {c.cancelRefundAmountLabel}
                <Input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={maxRefundPounds}
                  step="0.01"
                  value={refundPounds}
                  onChange={(event) => setRefundPounds(event.target.value)}
                  placeholder={String(maxRefundPounds)}
                />
                {/* The cap, shown before he types past it rather than as a
                    server error after he presses the button. */}
                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                  {formatCopy(c.cancelRefundMax, { max: String(maxRefundPounds) })}
                </span>
              </label>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>
              {c.cancelBack}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={confirmCancel}
              disabled={cancelling || reason.trim().length === 0 || (refunding && !refundIsValid)}
            >
              {cancelling ? c.cancelCancelling : c.cancelConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
