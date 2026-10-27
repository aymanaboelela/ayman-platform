'use client';

import { useEffect } from 'react';
import type { CheckoutTarget } from '@ayman/contracts/outreach/auto';
import { apiPostVoid } from '@/lib/api';

/**
 * «فتحت خطوة الدفع» — tells the API a payment step is on screen, once per
 * mount, so a checkout left open can be followed up with a link straight back
 * to it (`AutoOutreachSweeper`, «كمّل الدفع»).
 *
 * ## Fire and forget, on purpose
 *
 * Nothing on the page waits on this and nothing it says can change what the
 * student sees. A signed-out visitor gets a 401, a stack without the
 * `outreach.whatsapp` entitlement a 404, a throttled one a 429 — every one of
 * them is swallowed, because a checkout that broke over a follow-up note
 * would be the feature costing the sale it exists to recover.
 *
 * ## Why the effect keys on primitives
 *
 * The panels re-render constantly (a file picked, a phone typed). An object
 * in the dependency list would post on every keystroke; the target id posts
 * when the checkout itself changes and never otherwise.
 *
 * A new module rather than an export on `lib/api.ts`, per the Turbopack note
 * in `docs/agents/pitfalls.md`.
 */
export function useCheckoutIntent(
  target: CheckoutTarget,
  targetId: string | null,
  options: { monthsFromUrl?: boolean } = {},
): void {
  const monthsFromUrl = options.monthsFromUrl === true;
  useEffect(() => {
    if (!targetId) return;
    // Read inside the effect, never during render: `window` does not exist on
    // the server pass, and a value that differs between the two is a
    // hydration mismatch.
    void apiPostVoid('/api/checkout-intents', {
      target,
      targetId,
      monthIds: monthsFromUrl ? monthIdsFromLocation() : [],
    }).catch(() => undefined);
  }, [target, targetId, monthsFromUrl]);
}

/** `?month=a,b` as the subscribe panel reads it — the ids only, unchecked. */
export function monthIdsFromLocation(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = new URLSearchParams(window.location.search).get('month');
  if (!raw) return [];
  // The API keeps only months of this course; this only drops what would fail
  // the schema outright and cost the whole write.
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 12);
}
