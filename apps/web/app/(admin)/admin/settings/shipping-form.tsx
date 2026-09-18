'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { StoreSettingsSchema, type StoreSettings } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { SettingsField, issuesFromErrors } from './settings-field';
import { updateStoreAction } from './actions';

export interface ShippingFormProps {
  defaultValues: StoreSettings;
}

/** The three zones, in the order a student reads them — nearest first. */
const ZONES = [
  ['cairo_giza', copy.admin.settings.shippingCairoGiza],
  ['delta', copy.admin.settings.shippingDelta],
  ['far', copy.admin.settings.shippingFar],
] as const;

/** See `contact-form.tsx`'s identical comment: `.default()` fields make the
 *  Zod INPUT type optional, so `useForm` needs the three-generic form to keep
 *  `onSubmit` typed against the OUTPUT. */
type ShippingFormValues = z.input<typeof StoreSettingsSchema>;

/**
 * «سعر شحن الكتاب» — the three zone fees.
 *
 * ## Pounds here, piastres in the contract
 *
 * `BookShippingRatesSchema` is in piastres like every other money field on the
 * platform, but nobody types 8000 when they mean ٨٠ ج. The input shows pounds
 * and multiplies on the way out, which is why these are controlled rather than
 * `register`ed — the translation belongs at the one place a value enters the
 * form, not as a second rule layered on top of the shared schema.
 *
 * A blank input is `0`, not `NaN`: `Number('')` is `0` already, but
 * `Number.parseInt('')` is `NaN` and would fail the schema with a message
 * about a type rather than about a price. Free delivery for a zone is a real
 * thing to want, so `0` is allowed rather than treated as "unset".
 *
 * ## `shippingCents` rides along untouched
 *
 * `StoreSettingsSchema` is `.strict()` and the stored row carries the legacy
 * flat fee, so the PATCH body has to include it. It is spread from
 * `defaultValues` and never shown — the API parses and ignores it, and a form
 * that offered to edit a dead field would be offering a lie.
 */
export function ShippingForm({ defaultValues }: ShippingFormProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<ShippingFormValues, unknown, StoreSettings>({
    resolver: zodResolver(StoreSettingsSchema),
    defaultValues,
  });
  const issues = issuesFromErrors(form.formState.errors);

  async function onSubmit(values: StoreSettings) {
    setSaveError(null);
    const result = await updateStoreAction(values);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      router.refresh();
    } else {
      setSaveError(copy.admin.common.saveFailed);
      toast.error(copy.admin.common.saveFailed);
    }
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {saveError ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
          {saveError}
        </p>
      ) : null}

      <p className="text-[length:var(--fs-text-sm)] text-muted">{copy.admin.settings.shippingNote}</p>

      {ZONES.map(([zone, label]) => (
        <SettingsField
          key={zone}
          name={`shippingRates.${zone}`}
          label={label}
          description={copy.admin.settings.shippingUnit}
          issues={issues}
          render={(controlProps) => (
            <Input
              {...controlProps}
              type="number"
              min={0}
              step={1}
              dir="ltr"
              value={Math.round((form.watch(`shippingRates.${zone}`) ?? 0) / 100)}
              onChange={(event) =>
                form.setValue(`shippingRates.${zone}`, Number(event.target.value) * 100, {
                  shouldValidate: true,
                })
              }
            />
          )}
        />
      ))}

      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? copy.admin.common.saving : copy.admin.common.save}
        </Button>
      </div>
    </form>
  );
}
