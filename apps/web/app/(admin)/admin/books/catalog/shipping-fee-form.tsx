'use client';

import { useState, useTransition } from 'react';
import { Truck } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import type { BookShippingRates, BookShippingZone } from '@ayman/contracts/books';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { setBookShippingAction } from './actions';

const c = copy.admin.books;

/**
 * الشحن — ثلاث مناطق، مش رقم واحد.
 *
 * ## Why it is a setting and not a constant
 *
 * Unchanged from the single-fee version: the courier's price moves, and a
 * deploy is the wrong unit of work for that. Ayman states these numbers —
 * «قاهرة وجيزة ٨٠، وجه بحري ١٠٠، صعيد وسينا وبحر أحمر ١٥٠» — so they have to be
 * numbers he can change.
 *
 * ## Why three fields and not one
 *
 * One flat fee was wrong in both directions at once: it over-charged the two
 * cities the courier reaches soonest and under-charged every address he drives
 * a day to. Which governorate sits in which zone is NOT editable here and is
 * deliberately not a setting — it is a fact about the map (see
 * `bookShippingZoneOf`), and a mis-assigned governorate is a bug to fix rather
 * than a field to get wrong at 1am.
 *
 * ## Why changing a rate cannot rewrite an old order
 *
 * Every order froze its own `shipping_cents` at checkout. Raising one of these
 * changes what the NEXT order to that zone is quoted and nothing else — which
 * is what a price change should mean, and the reason the fee is a column on the
 * order rather than a lookup at render time.
 *
 * Typed in pounds, stored in piastres, converted here — the same boundary and
 * the same `Math.round` as `BookFormDialog`'s own prices, so there is exactly
 * one rule about where that conversion happens.
 */

/** The three zones in the order the country is usually read: nearest first. */
const ZONES: { id: BookShippingZone; label: string; hint: string }[] = [
  { id: 'cairo_giza', label: c.shippingZoneNear, hint: c.shippingZoneNearHint },
  { id: 'delta', label: c.shippingZoneDelta, hint: c.shippingZoneDeltaHint },
  { id: 'far', label: c.shippingZoneFar, hint: c.shippingZoneFarHint },
];

export function ShippingFeeForm({ rates }: { rates: BookShippingRates }) {
  /* Pounds as STRINGS, because an `<input type="number">` bound to a number
     cannot hold "" while the admin clears it to retype — the field would snap
     back to 0 mid-keystroke and a saved 0 is free delivery to a whole zone. */
  const [values, setValues] = useState<Record<BookShippingZone, string>>({
    cairo_giza: String(rates.cairo_giza / 100),
    delta: String(rates.delta / 100),
    far: String(rates.far / 100),
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    const parsed = ZONES.map((zone) => [zone.id, Number(values[zone.id].trim())] as const);
    /* All three validated BEFORE any of them is sent. A partial save would
       leave the country priced half one way and half the other, which is worse
       than a rejected form. */
    if (parsed.some(([, amount]) => !Number.isFinite(amount) || amount < 0)) {
      setError(c.shippingSettingFailed);
      setSaved(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setBookShippingAction({
        cairo_giza: Math.round(parsed[0]![1] * 100),
        delta: Math.round(parsed[1]![1] * 100),
        far: Math.round(parsed[2]![1] * 100),
      });
      setError(result.ok ? null : result.message);
      setSaved(result.ok);
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] font-medium text-fg">
        <Truck size={16} aria-hidden="true" />
        {c.shippingSettingTitle}
      </p>
      <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.shippingSettingHint}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {ZONES.map((zone) => (
          <div key={zone.id}>
            <Label htmlFor={`book-shipping-${zone.id}`}>{zone.label}</Label>
            <Input
              id={`book-shipping-${zone.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              dir="ltr"
              className="w-full"
              value={values[zone.id]}
              onChange={(event) => {
                setSaved(false);
                setValues((current) => ({ ...current, [zone.id]: event.target.value }));
              }}
            />
            {/* WHICH governorates, spelled out under each field. The zone names
                alone are ambiguous at the edges — «السويس وجه بحري ولا بعيد؟» —
                and an admin setting a price for a list he cannot see is an
                admin guessing. */}
            <p className="mt-1 text-[length:var(--fs-text-xs)] leading-snug text-fg-faint">
              {zone.hint}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? c.catalogSaving : c.shippingSettingSave}
        </Button>
        {saved && !pending ? (
          <span role="status" className="text-[length:var(--fs-text-xs)] text-ok">
            {copy.admin.common.saved}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-1 text-[length:var(--fs-text-xs)] text-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
