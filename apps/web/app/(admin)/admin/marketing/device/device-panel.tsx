'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { WhatsappDevice } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
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
  /** Lets `link()` collapse whatever wait is already scheduled — see there. */
  const pollSoon = useRef<(delay: number) => void>(() => {});

  useEffect(() => {
    function schedule(delay: number) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const next = await deviceStatusAction();
        if (next) setDevice(next);
        schedule(next?.state === 'linking' ? LINKING_POLL_MS : IDLE_POLL_MS);
      }, delay);
    }
    pollSoon.current = schedule;
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
      const result = await linkDeviceAction();
      if (result.ok) {
        setDevice(result.data);
        // The sidecar's transition to `linking` happens asynchronously, off
        // Baileys' own `connection.update` — this response is typically
        // still the pre-click, stale value. Collapse whatever idle-cadence
        // wait was already scheduled instead of leaving it to fire on its
        // own time, or a click can look like it did nothing for up to
        // `IDLE_POLL_MS`.
        pollSoon.current(LINKING_POLL_MS);
      } else {
        toast.error(result.message);
      }
    });
  }

  function unlink() {
    if (!confirm(c.unlinkConfirm)) return;
    startTransition(async () => {
      const result = await unlinkDeviceAction();
      if (result.ok) {
        const next = await deviceStatusAction();
        if (next) setDevice(next);
      } else {
        toast.error(result.message);
      }
    });
  }

  /**
   * Wipe the saved pairing and immediately try again.
   *
   * The same `unlink` call underneath — it is what clears the sidecar's auth
   * directory — but presented and worded for the state it is actually needed
   * in, and chained straight into a fresh `link()` so the operator's next
   * sight is a QR rather than a screen that looks identical to the one they
   * just pressed a button on.
   */
  function reset() {
    if (!confirm(c.resetConfirm)) return;
    startTransition(async () => {
      const cleared = await unlinkDeviceAction();
      if (!cleared.ok) {
        toast.error(cleared.message);
        return;
      }
      const relinked = await linkDeviceAction();
      if (relinked.ok) setDevice(relinked.data);
      else toast.error(relinked.message);
      pollSoon.current(LINKING_POLL_MS);
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

        {/*
          Rendered for EVERY state that carries one, not just `unreachable`.
          The sidecar already records why a handshake ended — `closed: 401`,
          `closed: 515` — on its `connection.update` close branch, and this
          screen used to throw that away everywhere except the one state
          where the service could not be reached at all. That is precisely
          backwards: an unreachable service explains itself, a `disconnected`
          one does not, and «مفيش رقم متربط» with a dead button and no reason
          is the exact report this line exists to answer.
        */}
        {device.detail ? (
          <p className="mono text-[length:var(--fs-text-xs)] text-fg-muted">
            <span className="me-1 font-sans">{c.deviceDetailLabel}</span>
            {device.detail}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-2">
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
          {/*
            The way OUT of a wedged pairing, and it had no way in.

            Saved credentials live on the sidecar's volume and survive every
            deploy — which is the point, so a working number is never asked
            to re-scan. The cost is that a HALF-written set survives too: a
            handshake killed midway leaves Baileys trying to resume a session
            that no longer exists instead of issuing a fresh QR, so the badge
            sits on «مفيش رقم متربط» and «اربط رقم جديد» looks like a dead
            button no matter how many times it is pressed.

            Wiping them is what fixes that, and until now the only control
            that did it — «افصل الرقم» — was rendered for `connected` alone,
            i.e. the one state where nobody needs it.
          */}
          {device.state === 'disconnected' || device.state === 'unreachable' || device.state === 'linking' ? (
            <Button variant="ghost" disabled={pending} onClick={reset}>
              {c.resetButton}
            </Button>
          ) : null}
        </div>

        {device.state === 'disconnected' || device.state === 'unreachable' ? (
          <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-xs)] text-fg-muted">
            {c.linkNoCodeHint}
          </p>
        ) : null}
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
