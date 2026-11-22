'use client';

import { Feather } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { setFxMode, useFxLite } from '@/lib/weak-device';

/**
 * «الوضع الخفيف» — the visitor's own switch for the lite mode that
 * `lib/weak-device.ts` otherwise decides by itself. In the phone drawer; the
 * desktop account menu carries the same switch as a checkbox item
 * (`account-menu-client.tsx`).
 *
 * The automatic decision is a guess plus a measurement, and both can be wrong
 * about one particular machine: a weak laptop that reports 8 threads, or a
 * strong one caught in one bad minute. This is the answer to both, from the
 * person in front of the screen, and once pressed it is final — no hint or
 * frame watchdog overrides it (`setFxMode`). Asked for by a student: «ياريت
 * تخفف الانميشن شوية». It is stored per browser, so switching it here also
 * lightens the public pages.
 *
 * It shows the EFFECTIVE state, so a machine the platform already put in lite
 * mode sees the switch on — and pressing it is how a strong machine that was
 * misjudged takes its effects back.
 *
 * Not on the marketing footer: `landing-preset.test.ts` pins that footer to
 * the byte, and a visitor with no account is covered by the automatic check.
 *
 * `useFxLite` reports "off" until hydration, matching the server HTML.
 */
export function FxToggle({ className }: { className?: string }) {
  const lite = useFxLite();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={lite}
      title={copy.fx.hint}
      className={className ? `fx-row ${className}` : 'fx-row'}
      data-on={lite}
      onClick={() => setFxMode(lite ? 'full' : 'lite')}
    >
      <Feather className="fx-row__icon" size={16} aria-hidden="true" />
      <span className="fx-row__label">{copy.fx.label}</span>
      <span className="fx-row__state">{lite ? copy.fx.on : copy.fx.off}</span>
    </button>
  );
}
