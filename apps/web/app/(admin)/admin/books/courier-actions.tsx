'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';
import type { AdminBookOrderRow, BookOrderCourierEvent } from '@ayman/contracts/admin/book-orders';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { courierBookOrdersAction, courierEventsAction } from './actions';
import { useCourierEnabled } from './bulk-ship';

const c = copy.admin.books;

/** The courier's teal — its own hue on a row that already spends violet on
 *  «المطبعة», green on «اتشحن» and blue on «وصل». */
export const COURIER_TONE = 'oklch(0.55 0.13 190)';

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * «ابعت لشركة الشحن» for one row — the printer is done with it. The order goes
 * into their system and is recorded «اتشحن» in the same press, which tells the
 * student. On a stack without the integration this renders `fallback` — the
 * plain «اتشحن» — so the card always shows ONE next step.
 */
export function SendToCourierAction({ id, fallback }: { id: string; fallback?: ReactNode }) {
  const enabled = useCourierEnabled();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (!enabled) return <>{fallback ?? null}</>;

  async function send() {
    if (!window.confirm(c.sendToCourierConfirm)) return;
    setPending(true);
    const result = await courierBookOrdersAction([id]);
    setPending(false);
    const row = result && !('error' in result) ? result.rows[0] : undefined;
    if (result && 'error' in result) toast.error(result.error);
    else if (row?.outcome === 'sent_to_courier') {
      toast.success(formatCopy(c.bulkCourierDone, { count: '1' }));
      // Sent, but «اتشحن» did not take — the reason says what to press.
      if (row.reason) toast.message(row.reason);
    } else toast.error(row?.reason ?? c.actionFailed);
    router.refresh();
  }

  return (
    <Button type="button" onClick={send} disabled={pending} style={{ background: COURIER_TONE, color: '#fff' }}>
      <Truck className="size-4" aria-hidden />
      {pending ? c.sendToCourierWorking : c.sendToCourier}
    </Button>
  );
}

/**
 * «اتبعت لشركة الشحن» — on an order the courier's system has, so a shipped
 * order the courier is carrying reads differently from one that went with
 * somebody else. Quiet teal: it is a fact, not a task.
 */
export function CourierChip({ row }: { row: AdminBookOrderRow }) {
  if (!row.courierSentAt || row.deletedAt) return null;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium leading-none"
      style={{ color: COURIER_TONE, background: `color-mix(in oklch, ${COURIER_TONE}, transparent 88%)` }}
    >
      <Truck className="size-3" aria-hidden />
      {c.courierSent}
    </span>
  );
}

/**
 * What the courier last said about the parcel, and — on demand — every step.
 *
 * Renders nothing until there is something to say: a status from them, or a
 * refusal in their words («المنطقة غير موجودة» is fixed by editing the
 * address, «مش متظبط» by a phone call).
 */
export function CourierPanel({ row }: { row: AdminBookOrderRow }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<BookOrderCourierEvent[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!row.courier && !row.courierError) return null;

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    const result = await courierEventsAction(row.id);
    setLoading(false);
    if (result === null) toast.error(c.courierTrailFailed);
    setEvents(result ?? []);
  }

  return (
    <div
      className="rounded-lg border px-3 py-2 text-[length:var(--fs-text-sm)]"
      style={{
        borderColor: `color-mix(in oklch, ${row.courierError ? 'var(--err)' : COURIER_TONE}, transparent 60%)`,
        background: `color-mix(in oklch, ${row.courierError ? 'var(--err)' : COURIER_TONE}, transparent 93%)`,
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: COURIER_TONE }}>
          <Truck className="size-4" aria-hidden />
          {c.courierLabel}
        </span>
        {row.courier ? (
          <span className="text-fg">
            {row.courier.statusName}
            {row.courier.note ? <span className="text-fg-muted"> — {row.courier.note}</span> : null}
          </span>
        ) : null}
        {row.courier?.agentName ? (
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {formatCopy(c.courierAgent, { name: row.courier.agentName })}
            {row.courier.agentPhone ? (
              <>
                {' · '}
                <span dir="ltr" className="[unicode-bidi:isolate]">
                  {row.courier.agentPhone}
                </span>
              </>
            ) : null}
          </span>
        ) : null}
        {row.courier ? (
          <button
            type="button"
            onClick={toggle}
            className="ms-auto text-[length:var(--fs-text-xs)] text-fg-muted underline decoration-dotted underline-offset-4 hover:text-fg"
          >
            {open ? c.courierTrailHide : c.courierTrail}
          </button>
        ) : null}
      </div>

      {row.courierError ? (
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
          {formatCopy(c.courierError, { error: row.courierError })}
        </p>
      ) : null}

      {open ? (
        <ol className="mt-2 flex flex-col gap-1 border-t border-line-subtle pt-2">
          {loading ? (
            <li className="text-[length:var(--fs-text-xs)] text-fg-muted">…</li>
          ) : events && events.length > 0 ? (
            events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-x-2 text-[length:var(--fs-text-xs)]">
                <time dateTime={event.receivedAt} className="tabular-nums text-fg-faint">
                  {dateFormatter.format(new Date(event.receivedAt))}
                </time>
                <span className="font-medium text-fg">{event.statusName}</span>
                {event.note ? <span className="text-fg-muted">— {event.note}</span> : null}
                {event.agentName ? <span className="text-fg-muted">· {event.agentName}</span> : null}
              </li>
            ))
          ) : (
            <li className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.courierTrailEmpty}</li>
          )}
        </ol>
      ) : null}
    </div>
  );
}
