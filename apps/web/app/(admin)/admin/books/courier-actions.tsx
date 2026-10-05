'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { AdminBookOrderRow, BookOrderCourierEvent } from '@ayman/contracts/admin/book-orders';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { courierBookOrdersAction, courierEventsAction, readyBookOrdersAction } from './actions';
import { useCourierEnabled } from './bulk-ship';

const c = copy.admin.books;

/** The courier's teal — its own hue on a row that already spends violet on
 *  «راح للمطبعة», green on «اتشحن» and blue on «وصل». */
const COURIER_TONE = 'oklch(0.55 0.13 190)';

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * «خلص وجاهز» for one row — the box came back from the printer.
 *
 * A batch of one through the batch route, so a refusal arrives with its reason
 * already worded («محجوز للمراجعة») rather than as a status code to map.
 */
export function ReadyAction({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function markReady() {
    if (!window.confirm(c.markReadyConfirm)) return;
    setPending(true);
    const result = await readyBookOrdersAction([id]);
    setPending(false);
    const row = result?.rows[0];
    if (row?.outcome === 'ready') toast.success(copy.admin.common.saved);
    else toast.error(row?.reason ?? c.actionFailed);
    router.refresh();
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={markReady} disabled={pending}>
      {pending ? c.markReadyWorking : c.markReady}
    </Button>
  );
}

/**
 * «ابعت لشركة الشحن» for one row. Rendered only where the stack has the
 * integration — `useCourierEnabled` reads the same flag the bulk bar does.
 */
export function SendToCourierAction({ id }: { id: string }) {
  const enabled = useCourierEnabled();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (!enabled) return null;

  async function send() {
    if (!window.confirm(c.sendToCourierConfirm)) return;
    setPending(true);
    const result = await courierBookOrdersAction([id]);
    setPending(false);
    if (result && 'error' in result) toast.error(result.error);
    else if (result?.rows[0]?.outcome === 'sent_to_courier') toast.success(formatCopy(c.bulkCourierDone, { count: '1' }));
    else toast.error(result?.rows[0]?.reason ?? c.actionFailed);
    router.refresh();
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={send}
      disabled={pending}
      style={{ background: COURIER_TONE, color: '#fff' }}
    >
      {pending ? c.sendToCourierWorking : c.sendToCourier}
    </Button>
  );
}

/**
 * Where the courier says the parcel is — and, on demand, every step it went
 * through.
 *
 * Renders nothing for an order the courier has never heard of. A refused push
 * shows the courier's own sentence, because it is the only diagnosis there is
 * («المنطقة غير موجودة» is fixed by editing the address, «مش متظبط» by a call).
 */
export function CourierPanel({ row }: { row: AdminBookOrderRow }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<BookOrderCourierEvent[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!row.courier && !row.courierError && !row.courierSentAt) return null;

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
        borderColor: `color-mix(in oklch, ${COURIER_TONE}, transparent 60%)`,
        background: `color-mix(in oklch, ${COURIER_TONE}, transparent 92%)`,
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium" style={{ color: COURIER_TONE }}>
          {c.courierLabel}
        </span>
        {row.courier ? (
          <span className="text-fg">
            {row.courier.statusName}
            {row.courier.note ? <span className="text-fg-muted"> — {row.courier.note}</span> : null}
          </span>
        ) : null}
        {row.courier?.agentName && row.courier.agentPhone ? (
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {formatCopy(c.courierAgent, { name: row.courier.agentName })}
            {' · '}
            <span dir="ltr" className="[unicode-bidi:isolate]">
              {row.courier.agentPhone}
            </span>
          </span>
        ) : null}
        {row.courierSentAt ? (
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
