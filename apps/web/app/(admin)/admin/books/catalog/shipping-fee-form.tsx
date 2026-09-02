'use client';

import { useState, useTransition } from 'react';
import { Truck } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { setBookShippingAction } from './actions';

const c = copy.admin.books;

/**
 * The delivery fee — one number for the whole shop.
 *
 * ## Why it is a setting and not a constant
 *
 * The courier's price changes, and a deploy is the wrong unit of work for
 * that. Ayman's own framing is «الشحن بـ٦٥ جنيه» — a number he states, so it
 * has to be a number he can change.
 *
 * ## Why changing it cannot rewrite an old order
 *
 * Every order froze its own `shipping_cents` at checkout. Raising this changes
 * what the NEXT order is quoted and nothing else — which is what a price change
 * should mean, and is the reason the fee is a column on the order rather than a
 * lookup at render time.
 *
 * Typed in pounds, stored in piastres, converted here — the same boundary and
 * the same `Math.round` as `BookFormDialog`'s own prices, so there is exactly
 * one rule about where that conversion happens.
 */
export function ShippingFeeForm({ shippingCents }: { shippingCents: number }) {
  const [value, setValue] = useState(String(shippingCents / 100));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(c.shippingSettingFailed);
      return;
    }
    startTransition(async () => {
      const result = await setBookShippingAction(Math.round(parsed * 100));
      setError(result.ok ? null : result.message);
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] font-medium text-fg">
        <Truck size={16} aria-hidden="true" />
        {c.shippingSettingTitle}
      </p>
      <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
        {c.shippingSettingHint}
      </p>

      <div className="mt-2 flex items-end gap-2">
        <div>
          <Label htmlFor="book-shipping">{c.shippingSettingLabel}</Label>
          <Input
            id="book-shipping"
            type="number"
            inputMode="decimal"
            min={0}
            dir="ltr"
            className="w-28"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? c.catalogSaving : c.shippingSettingSave}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-1 text-[length:var(--fs-text-xs)] text-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
