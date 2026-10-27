'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { WhatsappDevice } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { closeReasonFor } from '@ayman/contracts/marketing/wa-errors';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Field, FieldLabel } from '@ayman/ui/components/field';
import { Input } from '@ayman/ui/components/input';
import { deviceStatusAction, linkDeviceAction, unlinkDeviceAction } from '../actions';
import { cairoWhen } from './when';

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
  /** The number to pair by CODE, for linking from this same phone. */
  const [pairPhone, setPairPhone] = useState('');
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

  function link(byPhone?: string) {
    startTransition(async () => {
      const result = await linkDeviceAction(byPhone ?? null);
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
  function reset(question: string = c.resetConfirm) {
    if (!confirm(question)) return;
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

  /**
   * «اربط رقم تاني بدل ده» — the old number out and a QR for the new one, in
   * ONE action. The same wipe-then-link as `reset`, offered while connected:
   * before it, replacing the number meant «افصل الرقم», then a screen saying
   * nothing was linked, then «اربط رقم جديد» — two confirms and a moment where
   * it looked like the click had broken something.
   */
  function replace() {
    reset(c.replaceConfirm);
  }

  const closeReason = closeReasonFor(device.detail);
  const limits = device.limits;
  const canLink = device.state === 'disconnected' || device.state === 'unreachable' || device.state === 'linking';

  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
        <Badge tone={TONE[device.state]}>{stateLabel(device)}</Badge>

        {device.state === 'disabled' ? (
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.deviceDisabledHint}</p>
        ) : null}

        {device.state === 'linking' && device.pairingCode ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.pairingCodeTitle}</p>
            <p className="mono text-[length:var(--fs-title-2)] font-semibold tracking-widest text-fg" dir="ltr">
              {device.pairingCode}
            </p>
            <p className="max-w-[var(--w-prose)] text-fg-muted">{c.pairingCodeSteps}</p>
          </div>
        ) : null}

        {device.state === 'linking' && device.qr && !device.pairingCode ? (
          <div className="flex flex-col items-center gap-2">
            <Image src={device.qr} alt="" width={280} height={280} className="rounded-[var(--r-lg)] border border-line" />
            <p className="text-fg-muted">{c.deviceLinkingSteps}</p>
          </div>
        ) : null}

        {device.state === 'connected' && device.phone ? (
          <p className="mono text-[length:var(--fs-title-3)] text-fg" dir="ltr">
            {device.phone}
          </p>
        ) : null}

        {device.state === 'connected' && device.connectedAt ? (
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {formatCopy(c.healthConnectedSince, { when: cairoWhen(device.connectedAt) ?? '' })}
          </p>
        ) : null}

        {/*
          WhatsApp's own word on whether this number may start new chats —
          the cause of nack 463, read BEFORE it happens. On a brand-new number
          every message is a new chat, so this line is the whole answer to
          «ليه الرسايل مش بتوصل» when it is showing.
        */}
        {device.state === 'connected' && limits?.restricted ? (
          <div className="max-w-[var(--w-prose)] rounded-[var(--r-md)] border border-[color:var(--err)] p-3 text-[length:var(--fs-text-sm)] text-err">
            <p className="font-medium">{limits.reason === 'capped' ? c.healthCapped : c.healthRestricted}</p>
            {limits.until ? (
              <p className="mt-1">{formatCopy(c.healthRestrictedUntil, { when: cairoWhen(limits.until) ?? '' })}</p>
            ) : null}
          </div>
        ) : null}

        {device.state === 'connected' && limits?.quotaTotal ? (
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {formatCopy(c.healthQuota, { used: limits.quotaUsed ?? 0, total: limits.quotaTotal })}
          </p>
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
          <div className="flex max-w-[var(--w-prose)] flex-col items-center gap-1">
            {closeReason ? <p className="text-[length:var(--fs-text-sm)] text-fg">{closeReason}</p> : null}
            <p className="mono text-[length:var(--fs-text-xs)] text-fg-muted">
              <span className="me-1 font-sans">{c.deviceDetailLabel}</span>
              <span dir="ltr" className="[unicode-bidi:isolate]">
                {device.detail}
              </span>
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {device.state === 'disconnected' || device.state === 'unreachable' ? (
            <Button disabled={pending} onClick={() => link()}>
              {pending ? c.linkPending : c.linkButton}
            </Button>
          ) : null}
          {device.state === 'connected' ? (
            <Button variant="secondary" disabled={pending} onClick={replace}>
              {c.replaceButton}
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
            <Button variant="ghost" disabled={pending} onClick={() => reset()}>
              {c.resetButton}
            </Button>
          ) : null}
        </div>

        {device.state === 'disconnected' || device.state === 'unreachable' ? (
          <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-xs)] text-fg-muted">
            {c.linkNoCodeHint}
          </p>
        ) : null}

        {/*
          Pairing by CODE. A QR cannot be scanned by the phone that is
          displaying it, and the likeliest way this page gets opened on the
          day a new number is linked is on that very phone.
        */}
        {canLink && !device.pairingCode ? (
          <div className="flex w-full max-w-sm flex-col items-stretch gap-2 border-t border-line-subtle pt-4 text-start">
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.pairByCodeHint}</p>
            <Field name="pair-phone">
              <FieldLabel>{c.pairPhoneLabel}</FieldLabel>
              <Input
                value={pairPhone}
                onChange={(event) => setPairPhone(event.target.value)}
                dir="ltr"
                inputMode="tel"
                placeholder="+2010xxxxxxxx"
              />
            </Field>
            <Button
              variant="secondary"
              disabled={pending || pairPhone.trim().length < 10}
              onClick={() => link(pairPhone)}
            >
              {pending ? c.linkPending : c.pairPhoneButton}
            </Button>
          </div>
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
