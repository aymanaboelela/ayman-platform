'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminPaymentListSchema,
  type AdminPaymentList,
  type AdminPaymentRow,
} from '@ayman/contracts/admin/payments';
import { Button } from '@ayman/ui/components/button';
import { Textarea } from '@ayman/ui/components/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { apiGet } from '@/lib/api';
import { formatEGP } from '@/lib/price';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { useLiveList } from '@/components/admin/live-list';
import {
  usePaymentsPendingCount,
  useRefreshPaymentsPendingCount,
} from '@/components/admin/payments-alerts';
import { approvePaymentAction, rejectPaymentAction } from '../payments/actions';
import { planLabel } from '../payments/plan-label';
import { REVIEW_QUERY } from './query';

const c = copy.admin.review;
const cp = copy.admin.payments;

/** Cairo, pinned — the same reason as the desk list's own formatter: this
 *  renders on the server first, and an unpinned clock disagrees with itself. */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

function screenshotSrc(id: string): string {
  return `/api/admin/payments/submissions/${id}/screenshot`;
}

function failureFor(message: string): string {
  return message === 'already-reviewed' ? cp.alreadyReviewed : cp.actionFailed;
}

/**
 * The deck. Live like the desk list (`useLiveList` on the same `payments`
 * queue), so a claim that arrives mid-session joins the end of the deck and
 * one approved from another device leaves it — without a refresh.
 *
 * ## Why decisions are also kept locally
 *
 * The live re-read lands a moment AFTER the action returns. Without the
 * `decided` set the card just approved would flash back for that moment and
 * read as "it did not take". The set only ever hides rows; the server's list
 * is still the only thing that can add one.
 *
 * ## «بعدين»
 *
 * Moves the card to the back rather than dropping it: a transfer that has not
 * landed yet is the usual reason to wait, and it is still owed an answer.
 */
export function ReviewDeck({ initial }: { initial: AdminPaymentList }) {
  const read = useCallback(
    (signal: AbortSignal) =>
      apiGet(`/api/admin/payments/submissions?${REVIEW_QUERY}`, AdminPaymentListSchema, {
        signal,
        cache: 'no-store',
      }),
    [],
  );
  const { data, request } = useLiveList('payments', initial, read);

  // Same floor under the stream as the desk list: the sidebar's own poll
  // moving to a number this deck does not show means a frame was missed.
  const pendingCount = usePaymentsPendingCount();
  useEffect(() => {
    if (pendingCount !== null && pendingCount !== data.rowCount) request();
  }, [pendingCount, data.rowCount, request]);

  const refreshPendingCount = useRefreshPaymentsPendingCount();
  const [decided, setDecided] = useState<ReadonlySet<string>>(() => new Set());
  const [later, setLater] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [zoomed, setZoomed] = useState(false);

  const deck = useMemo(() => {
    const open = data.rows.filter((row) => !decided.has(row.id));
    const now = open.filter((row) => !later.includes(row.id));
    const back = later
      .map((id) => open.find((row) => row.id === id))
      .filter((row): row is AdminPaymentRow => row !== undefined);
    return [...now, ...back];
  }, [data.rows, decided, later]);

  const current = deck[0] ?? null;
  const next = deck[1] ?? null;

  // The next transfer's picture, fetched while this one is being read, so
  // the card after a decision paints whole instead of image-last.
  useEffect(() => {
    if (!next?.hasScreenshot) return;
    const image = new Image();
    image.src = screenshotSrc(next.id);
  }, [next]);

  function settle(row: AdminPaymentRow, sentence: string) {
    setDecided((previous) => new Set([...previous, row.id]));
    setLater((previous) => previous.filter((id) => id !== row.id));
    setZoomed(false);
    toast.success(formatCopy(sentence, { name: row.studentName }));
    refreshPendingCount();
  }

  async function approve() {
    if (!current || busy) return;
    setBusy('approve');
    const result = await approvePaymentAction(current.id);
    setBusy(null);
    if (result.ok) settle(current, c.approved);
    else toast.error(failureFor(result.message));
  }

  async function reject() {
    if (!current || busy || reason.trim().length === 0) return;
    setBusy('reject');
    const result = await rejectPaymentAction(current.id, reason.trim());
    setBusy(null);
    if (result.ok) {
      setRejectOpen(false);
      setReason('');
      settle(current, c.rejected);
    } else {
      toast.error(failureFor(result.message));
    }
  }

  function skip() {
    if (!current) return;
    setZoomed(false);
    setLater((previous) => [...previous.filter((id) => id !== current.id), current.id]);
  }

  const done = decided.size;
  const total = done + deck.length;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
            {c.eyebrow}
          </p>
          <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        </div>
        <Link
          href="/admin/payments"
          className="shrink-0 text-[length:var(--fs-text-sm)] text-fg-muted underline decoration-dotted underline-offset-4 hover:text-fg"
        >
          {c.allPayments}
        </Link>
      </header>

      {current ? (
        <>
          <ProgressBar done={done} total={total} />

          <article key={current.id} className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/students/${current.userId}`}
                  className="text-[length:var(--fs-title-3)] font-semibold text-fg hover:text-accent-text"
                >
                  {current.studentName}
                </Link>
                <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">
                  {current.approvedBefore > 0
                    ? formatCopy(cp.approvedBefore, { n: current.approvedBefore })
                    : cp.approvedBeforeNone}
                </p>
              </div>
              <WhatsappButton phone={current.studentPhone} label={cp.whatsapp} size="sm" />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Fact label={cp.columnAmount}>
                <span className="mono text-[length:var(--fs-title-3)] font-semibold text-fg">
                  {formatEGP(current.amountCents)} ج
                </span>
              </Fact>
              <Fact label={cp.columnPlan}>{planLabel(current)}</Fact>
              <Fact label={cp.columnCourse} wide>
                {current.courseTitle}
              </Fact>
              <Fact label={cp.senderPhoneLabel}>
                <span dir="ltr" className="mono [unicode-bidi:isolate]">
                  {current.senderPhone ?? '—'}
                </span>
              </Fact>
              <Fact label={cp.columnDate}>
                <time dateTime={current.createdAt}>
                  {dateFormatter.format(new Date(current.createdAt))}
                </time>
              </Fact>
            </dl>

            {current.hasScreenshot ? (
              <button
                type="button"
                onClick={() => setZoomed(true)}
                aria-label={c.zoomHint}
                className="mt-4 block w-full overflow-hidden rounded-lg border border-line bg-surface-3"
              >
                {/* A plain `<img>` — a private, `payment:read`-gated route,
                    never `next/image`. See `PaymentScreenshotThumbnail`. */}
                <img
                  src={screenshotSrc(current.id)}
                  alt={formatCopy(cp.screenshotAlt, { student: current.studentName })}
                  className="mx-auto block max-h-[55dvh] w-auto max-w-full object-contain"
                />
              </button>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
                {c.noScreenshot}
              </p>
            )}
          </article>

          {/*
            Pinned to the bottom of the screen, where a thumb already is. The
            safe-area inset keeps it clear of the iPhone's home indicator in
            the installed app, which has no browser chrome to do that for it.
          */}
          <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-line bg-surface-1 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:mx-0 md:rounded-xl md:border">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="danger"
                onClick={() => setRejectOpen(true)}
                disabled={busy !== null}
                className="h-14 text-[length:var(--fs-text-base)]"
              >
                <X className="size-5" aria-hidden="true" />
                {cp.reject}
              </Button>
              <button
                type="button"
                onClick={approve}
                disabled={busy !== null}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-sm bg-ok text-[length:var(--fs-text-base)] font-semibold text-white transition-opacity duration-[var(--d-hover)] hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
              >
                <Check className="size-5" aria-hidden="true" />
                {busy === 'approve' ? cp.approving : cp.approve}
              </button>
            </div>
            {deck.length > 1 ? (
              <button
                type="button"
                onClick={skip}
                disabled={busy !== null}
                className="mt-2 h-10 w-full text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg disabled:opacity-50"
              >
                {c.later}
              </button>
            ) : null}
          </div>

          {zoomed && current.hasScreenshot ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={formatCopy(cp.screenshotAlt, { student: current.studentName })}
              onClick={() => setZoomed(false)}
              className="fixed inset-0 z-50 overflow-auto bg-black/90"
            >
              <button
                type="button"
                onClick={() => setZoomed(false)}
                aria-label={copy.admin.common.close}
                className="fixed end-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-white/15 text-white"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
              {/* Natural size, scrollable — the point of zooming is reading
                  the transfer number and the amount, not fitting the frame. */}
              <img
                src={screenshotSrc(current.id)}
                alt=""
                onClick={(event) => event.stopPropagation()}
                className="mx-auto block min-w-full max-w-none"
              />
            </div>
          ) : null}

          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogContent closeLabel={cp.rejectCancel}>
              <DialogHeader>
                <DialogTitle>{cp.rejectPromptTitle}</DialogTitle>
              </DialogHeader>
              <div>
                <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.quickReasonsLabel}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.quickReasons.map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => setReason(quick)}
                      className="rounded-full border border-line px-3 py-1.5 text-[length:var(--fs-text-sm)] text-fg hover:border-accent hover:text-accent-text"
                    >
                      {quick}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
                {cp.rejectReasonLabel}
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={cp.rejectReasonPlaceholder}
                  rows={3}
                />
              </label>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setRejectOpen(false)}>
                  {cp.rejectCancel}
                </Button>
                <Button
                  variant="danger"
                  onClick={reject}
                  disabled={busy !== null || reason.trim().length === 0}
                >
                  {busy === 'reject' ? cp.rejecting : cp.rejectConfirm}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-line bg-surface-2 px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-ok text-white">
            <Check className="size-7" aria-hidden="true" />
          </span>
          <p className="mt-4 text-[length:var(--fs-title-3)] font-semibold text-fg">{c.doneTitle}</p>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.doneHint}</p>
          <Link
            href="/admin"
            className="mt-6 text-[length:var(--fs-text-sm)] text-accent-text underline underline-offset-4"
          >
            {c.backToDashboard}
          </Link>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="mt-4">
      <div className="flex justify-between text-[length:var(--fs-text-xs)] text-fg-muted">
        <span>{formatCopy(c.position, { n: done + 1, total })}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.round((done / Math.max(total, 1)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Fact({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[length:var(--fs-text-xs)] text-fg-faint">{label}</dt>
      <dd className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg">{children}</dd>
    </div>
  );
}
