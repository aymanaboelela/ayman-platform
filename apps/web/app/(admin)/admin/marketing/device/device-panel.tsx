'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { WhatsappDevice } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge, Button, Card, CardBody } from '@ayman/ui';
import { AdminApiError } from '@/lib/admin-api';
import { deviceStatusAction, linkDeviceAction, unlinkDeviceAction } from '../actions';

const c = copy.marketing;

/** While pairing, the QR the sidecar generates rotates — poll fast enough
 *  that a stale one is never on screen for long. */
const LINKING_POLL_MS = 3000;
/** Otherwise, just often enough to notice a drop without hammering the API. */
const IDLE_POLL_MS = 15_000;

const TONE = {
  disabled: 'neutral',
  unreachable: 'err',
  disconnected: 'warn',
  linking: 'accent',
  connected: 'ok',
} as const;

/**
 * The one screen that can make the platform speak as the instructor.
 *
 * Polls its own status rather than waiting on a server action's return value,
 * because pairing is inherently async on the OTHER end — the phone has to
 * scan a code — and the only way to know it happened is to keep asking.
 */
export function DevicePanel({ initial }: { initial: WhatsappDevice }) {
  const [device, setDevice] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function schedule(delay: number) {
      timer.current = setTimeout(async () => {
        const next = await deviceStatusAction();
        if (next) setDevice(next);
        schedule(next?.state === 'linking' ? LINKING_POLL_MS : IDLE_POLL_MS);
      }, delay);
    }
    schedule(device.state === 'linking' ? LINKING_POLL_MS : IDLE_POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Re-arms only when the CLASS of polling changes (linking vs not) — not on
    // every `device` update, which would restart the timer on its own tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.state === 'linking']);

  function link() {
    startTransition(async () => {
      try {
        const next = await linkDeviceAction();
        setDevice(next);
      } catch (err) {
        toast.error(err instanceof AdminApiError ? err.message : 'حصل خطأ، حاول تاني');
      }
    });
  }

  function unlink() {
    if (!confirm(c.unlinkConfirm)) return;
    startTransition(async () => {
      try {
        await unlinkDeviceAction();
        const next = await deviceStatusAction();
        if (next) setDevice(next);
      } catch (err) {
        toast.error(err instanceof AdminApiError ? err.message : 'حصل خطأ، حاول تاني');
      }
    });
  }

  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
        <Badge tone={TONE[device.state]}>{stateLabel(device)}</Badge>

        {device.state === 'disabled' ? (
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.deviceDisabledHint}</p>
        ) : null}

        {device.state === 'linking' && device.qr ? (
          <div className="flex flex-col items-center gap-2">
            <Image src={device.qr} alt="" width={280} height={280} className="rounded-[var(--r-lg)] border border-line" />
            <p className="text-fg-muted">{c.deviceLinkingSteps}</p>
          </div>
        ) : null}

        {device.state === 'connected' && device.phone ? (
          <p className="mono text-[length:var(--fs-title-3)] text-fg">{device.phone}</p>
        ) : null}

        {device.state === 'unreachable' && device.detail ? (
          <p className="mono text-[length:var(--fs-text-xs)] text-fg-muted">{device.detail}</p>
        ) : null}

        <div className="flex gap-2">
          {device.state === 'disconnected' || device.state === 'unreachable' ? (
            <Button disabled={pending} onClick={link}>
              {pending ? c.linkPending : c.linkButton}
            </Button>
          ) : null}
          {device.state === 'connected' ? (
            <Button variant="danger" disabled={pending} onClick={unlink}>
              {c.unlinkButton}
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function stateLabel(device: WhatsappDevice): string {
  switch (device.state) {
    case 'disabled':
      return c.deviceDisabled;
    case 'unreachable':
      return c.deviceUnreachable;
    case 'disconnected':
      return c.deviceDisconnected;
    case 'linking':
      return c.deviceLinking;
    case 'connected':
      return device.phone ? formatCopy(c.deviceConnectedAs, { phone: device.phone }) : c.deviceConnected;
  }
}
