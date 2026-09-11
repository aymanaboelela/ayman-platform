'use client';

import { useState, useSyncExternalStore } from 'react';
import { BellRing } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';

const c = copy.notifications;

/** Nothing to subscribe to — the value never changes after mount. */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * «خلي الموبايل ينبهني» — the student's side of Web Push.
 *
 * ## Why this exists, and why it took a WhatsApp outage to add it
 *
 * Every server-side piece of Web Push has been on `main` for a long time: the
 * VAPID keys, `web-push`, the `PushSubscription` table, the three `/api/me/push`
 * routes, a `push` handler in `sw.js`, and a service worker registered for
 * every visitor. All of it reached nobody, because the ONLY thing in the whole
 * app that ever called `subscribeToPush()` was the admin header's inbox toggle
 * — behind `conversation:read`. No student account could subscribe even in
 * principle, and the subscription table had one row against nine thousand
 * students.
 *
 * It became urgent when the WhatsApp sender started having its messages
 * accepted by WhatsApp and delivered to nobody. The in-app broadcast that
 * replaces it reaches every account with no phone number and no third party —
 * but only on the student's next visit, and an announcement nobody opens the
 * site to read is not an announcement. This is what makes it buzz a phone.
 *
 * ## Why a card and not an icon
 *
 * The topbar has a documented 360px budget with four controls already in it
 * (see `student-topbar.tsx`), and a fifth silent icon is not what gets a
 * permission prompt accepted anyway. A student who opened the notifications
 * page is, by definition, the person who wants to be notified — so the ask is
 * made here, in words, once, and disappears the moment it is answered.
 *
 * ## What it never does
 *
 * It never asks on load. A `Notification.requestPermission()` fired from an
 * effect is the pattern browsers now permanently block a site for, and it is
 * the reason a lot of sites can never ask again. It asks on a click, once.
 */
export function PushOptIn() {
  /*
    Deferred to after hydration: `Notification.permission` does not exist on
    the server, so reading it during render would make the first client render
    disagree with the SSR'd HTML. The same `subscribeNever` store that
    `inbox-alerts.tsx` and `assistant-widget.tsx` use, for the same reason.
  */
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  // Set ONLY by the click, never by an effect.
  const [answered, setAnswered] = useState<NotificationPermission | null>(null);
  const [busy, setBusy] = useState(false);

  const supported = hydrated && typeof Notification !== 'undefined';
  const permission = answered ?? (supported ? Notification.permission : null);

  // Already on, already refused, or a browser without the API (iOS Safari
  // outside a Home Screen install is the common one): nothing useful to offer,
  // so render nothing rather than a control that cannot work. «مرفوض» in
  // particular is not worth a line — the student cannot undo it from here, only
  // from browser settings, and a permanent nag for that is worse than silence.
  if (permission === null || permission === 'granted' || permission === 'denied') return null;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-[var(--r-lg)] border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.pushOptInTitle}</p>
          <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">{c.pushOptInLead}</p>
        </div>
      </div>

      <Button
        className="shrink-0"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void Notification.requestPermission().then(async (result) => {
            setAnswered(result);
            /*
              Web Push on the SAME click. Granting the OS permission and holding
              a live push subscription are two different browser facts, and only
              the second one survives the tab closing — the note
              `push-subscribe.ts` opens with.

              `await import`, not a static import: that module reaches
              `PushPublicKeySchema`, a real Zod schema, and this component is
              part of the notifications route's bundle. `client-barrel.test.ts`
              is what enforces this.
            */
            if (result === 'granted') {
              const { subscribeToPush } = await import('@/lib/push-subscribe');
              await subscribeToPush();
            }
            setBusy(false);
          });
        }}
      >
        {busy ? c.pushOptInWorking : c.pushOptInButton}
      </Button>
    </div>
  );
}
