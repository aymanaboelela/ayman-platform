'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { MessageCircle, Pause, Play, FlaskConical } from 'lucide-react';
import type { WaContactsStatus } from '@ayman/contracts/marketing/wa-contacts';
import { copy } from '@ayman/contracts/copy/admin';
import { waContactsCopy as c } from '@ayman/contracts/copy/wa-contacts';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { toast } from 'sonner';
import { pauseWaContactsAction, startWaContactsAction, waContactsStatusAction } from './wa-contacts-actions';

/** The pacing the API runs at — passed in, so this bundle carries no Zod. */
export interface WaContactsPace {
  batchSize: number;
  dailyCap: number;
  windowStartHour: number;
  windowEndHour: number;
  trial: number;
}

/** While open and running, the panel re-reads its status this often. */
const POLL_MS = 10_000;

const STATE_LABEL: Record<WaContactsStatus['state'], string> = {
  idle: c.stateIdle,
  running: c.stateRunning,
  paused: c.statePaused,
  done: c.stateDone,
};

const STATE_TONE: Record<WaContactsStatus['state'], string> = {
  idle: 'bg-surface-3 text-fg-muted',
  running: 'bg-ok text-surface-1',
  paused: 'bg-accent text-accent-contrast',
  done: 'bg-info text-surface-1',
};

/**
 * «احفظهم في واتساب» — every student as a contact in the linked number's
 * WhatsApp only, so the Status reaches them. The run itself is the API's
 * (`WaContactsRunner`); this opens it, shows how far it got, and starts or
 * stops it. Closing the page does not stop it.
 *
 * The first button is the trial on purpose: five students, then a Status,
 * then «مين شاف» on the phone — the only way to prove the contacts count for
 * Status before thousands are written.
 */
export function WaContactsButton({ canRun, pace }: { canRun: boolean; pace: WaContactsPace }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<WaContactsStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const next = await waContactsStatusAction();
    setFailed(next === null);
    if (next) setStatus(next);
  }, []);

  // The first read happens in `onOpenChange`; this only keeps it fresh.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void refresh();
  }

  function run(work: () => ReturnType<typeof pauseWaContactsAction>, done: string) {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setStatus(result.data);
      toast.success(done);
    });
  }

  function startAll() {
    const remaining = status ? Math.max(status.counts.pending, status.studentsWithPhone - status.counts.saved) : 0;
    if (!window.confirm(formatCopy(c.startAllConfirm, { n: remaining.toLocaleString('en') }))) return;
    run(() => startWaContactsAction(null), c.started);
  }

  const s = status;
  const handled = s ? s.counts.saved + s.counts.notOnWhatsapp + s.counts.failed + s.counts.skipped : 0;
  const total = s ? Math.max(s.studentsWithPhone, handled + s.counts.pending) : 0;
  const percent = total > 0 ? Math.round((s!.counts.saved / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <MessageCircle className="size-4" aria-hidden="true" />
          {c.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{c.lead}</DialogDescription>
        </DialogHeader>

        <p className="rounded-md bg-surface-2 p-3 text-[length:var(--fs-text-xs)] text-fg-muted">{c.phoneSetting}</p>

        {!s ? (
          <p className="text-fg-muted">{failed ? c.loadFailed : c.loading}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[length:var(--fs-text-xs)] font-semibold ${STATE_TONE[s.state]}`}>
                {STATE_LABEL[s.state]}
              </span>
              <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                {formatCopy(c.savedToday, { n: s.savedToday, cap: s.dailyCap })}
              </span>
            </div>

            {!s.deviceConnected ? <p className="text-danger">{c.deviceOffline}</p> : null}
            {s.state === 'paused' && s.pauseCode ? <p className="text-fg">{c.pauseReason[s.pauseCode]}</p> : null}
            {s.state === 'paused' && s.lastError ? (
              <p className="rounded-md bg-surface-2 p-2 text-[length:var(--fs-text-xs)] text-fg-muted">
                {s.lastError}
              </p>
            ) : null}

            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
            >
              <div className="h-full rounded-full bg-ok transition-[width] duration-300" style={{ width: `${percent}%` }} />
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label={c.statSaved} value={s.counts.saved} tone="text-ok" />
              <Stat label={c.statPending} value={s.counts.pending} tone="text-accent-text" />
              <Stat label={c.statNotOnWhatsapp} value={s.counts.notOnWhatsapp} tone="text-fg-muted" />
              <Stat label={c.statFailed} value={s.counts.failed} tone="text-danger" />
              <Stat label={c.statStudents} value={s.studentsWithPhone} tone="text-fg" />
            </dl>

            <ul className="flex flex-col gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {s.state === 'running' && s.nextAt ? <li>{formatCopy(c.nextAt, { at: when(s.nextAt) })}</li> : null}
              {s.lastSavedAt ? <li>{formatCopy(c.lastSavedAt, { at: when(s.lastSavedAt) })}</li> : null}
              {s.counts.pending > 0 ? <li>{formatCopy(c.estimate, { time: duration(s.estimateMinutes) })}</li> : null}
              <li>
                {formatCopy(c.pace, {
                  batch: pace.batchSize,
                  cap: pace.dailyCap,
                  from: pace.windowStartHour,
                  to: pace.windowEndHour - 12,
                })}
              </li>
            </ul>

            {canRun ? (
              <div className="flex flex-wrap gap-2">
                {s.state === 'running' ? (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(pauseWaContactsAction, c.paused)}>
                    <Pause className="size-4" aria-hidden="true" />
                    {c.pause}
                  </Button>
                ) : (
                  <>
                    {s.counts.saved === 0 ? (
                      <Button
                        size="sm"
                        disabled={pending || !s.deviceConnected}
                        onClick={() => run(() => startWaContactsAction(pace.trial), c.started)}
                      >
                        <FlaskConical className="size-4" aria-hidden="true" />
                        {formatCopy(c.trial, { n: pace.trial })}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={s.counts.saved === 0 ? 'secondary' : 'primary'}
                      disabled={pending || !s.deviceConnected}
                      onClick={s.state === 'paused' && s.runLimit === null ? () => run(() => startWaContactsAction(null), c.started) : startAll}
                    >
                      <Play className="size-4" aria-hidden="true" />
                      {s.state === 'paused' && s.runLimit === null ? c.resume : c.startAll}
                    </Button>
                  </>
                )}
              </div>
            ) : null}
            {canRun && s.counts.saved === 0 && s.state !== 'running' ? (
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{formatCopy(c.trialHint, { n: pace.trial })}</p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-2">
      <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
      <dd className={`text-[length:var(--fs-title-3)] font-semibold ${tone}`}>{value.toLocaleString('en')}</dd>
    </div>
  );
}

/** Cairo wall time, with the day when it is not today. */
function when(iso: string): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === new Date().toDateString();
  return at.toLocaleString('ar-EG', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    minute: '2-digit',
    ...(sameDay ? {} : { weekday: 'long' }),
  });
}

function duration(minutes: number): string {
  if (minutes < 60) return formatCopy(c.minutes, { n: Math.max(1, minutes) });
  if (minutes < 24 * 60) return formatCopy(c.hours, { n: Math.round(minutes / 60) });
  return formatCopy(c.days, { n: Math.round(minutes / (24 * 60)) });
}
