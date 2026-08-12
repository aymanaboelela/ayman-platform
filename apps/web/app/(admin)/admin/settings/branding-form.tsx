'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ACCENT_SLOTS,
  BrandingSchema,
  RADIUS_SLOTS,
  type Branding,
} from '@ayman/contracts/admin/settings';
import type { MediaAsset } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { ACCENT_RAMPS } from '@ayman/ui/branding';
import { Button } from '@ayman/ui/components/button';
import { RadioGroup, RadioGroupItem } from '@ayman/ui/components/radio-group';
import { Select } from '@ayman/ui/components/select';
import { AssetSelect } from './asset-select';
import { SettingsField, issuesFromErrors } from './settings-field';
import { updateBrandingAction } from './actions';

const ACCENT_LABEL: Record<(typeof ACCENT_SLOTS)[number], string> = {
  amber: copy.admin.branding.accentAmber,
  cyan: copy.admin.branding.accentCyan,
  blue: copy.admin.branding.accentBlue,
  violet: copy.admin.branding.accentViolet,
  magenta: copy.admin.branding.accentMagenta,
  slate: copy.admin.branding.accentSlate,
};

const RADIUS_LABEL: Record<(typeof RADIUS_SLOTS)[number], string> = {
  sharp: copy.admin.branding.radiusSharp,
  default: copy.admin.branding.radiusDefault,
  soft: copy.admin.branding.radiusSoft,
};

export interface BrandingFormProps {
  defaultValues: Branding;
  assets: readonly MediaAsset[];
}

/**
 * `BrandingSchema`'s enum/nullable fields all carry `.default(...)`, which
 * makes Zod's INPUT type (pre-parse) optional even though the OUTPUT type
 * (`Branding`) is fully required — the same three-generic `useForm` shape
 * `quiz-settings-form.tsx` already uses for this exact reason.
 */
type BrandingFormValues = z.input<typeof BrandingSchema>;

/**
 * The colour picker is a `RadioGroup` over `ACCENT_SLOTS` — a closed enum —
 * never a free-text or `<input type="color">` control (Global Constraint
 * 18 / A12). Each option's swatch renders the slot's OWN step-9 value from
 * `ACCENT_RAMPS` (the same table `renderBrandingStyle` renders from), so the
 * preview is exactly what saving would apply, not an approximation.
 */
export function BrandingForm({ defaultValues, assets }: BrandingFormProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<BrandingFormValues, unknown, Branding>({
    resolver: zodResolver(BrandingSchema),
    defaultValues,
  });
  const issues = issuesFromErrors(form.formState.errors);

  async function onSubmit(values: Branding) {
    setSaveError(null);
    const result = await updateBrandingAction(values);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      router.refresh();
    } else {
      setSaveError(copy.admin.common.saveFailed);
      toast.error(copy.admin.common.saveFailed);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {saveError ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
          {saveError}
        </p>
      ) : null}

      <SettingsField
        name="accent"
        label={copy.admin.settings.accent}
        issues={issues}
        render={(controlProps) => (
          <RadioGroup
            {...controlProps}
            value={form.watch('accent') ?? defaultValues.accent}
            onValueChange={(value) =>
              form.setValue('accent', value as Branding['accent'], { shouldValidate: true })
            }
            aria-label={copy.admin.settings.accent}
          >
            {ACCENT_SLOTS.map((slot) => (
              <label key={slot} className="flex items-center gap-3">
                <RadioGroupItem value={slot} />
                <span
                  aria-hidden="true"
                  className="size-5 shrink-0 rounded-full border border-line"
                  style={{ background: ACCENT_RAMPS[slot].light[0] }}
                />
                <span className="text-fg">{ACCENT_LABEL[slot]}</span>
              </label>
            ))}
          </RadioGroup>
        )}
      />

      <SettingsField
        name="radius"
        label={copy.admin.settings.radius}
        issues={issues}
        render={(controlProps) => (
          <Select {...controlProps} {...form.register('radius')}>
            {RADIUS_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {RADIUS_LABEL[slot]}
              </option>
            ))}
          </Select>
        )}
      />

      <SettingsField
        name="logoLightAssetId"
        label={copy.admin.settings.logoLight}
        description={copy.admin.settings.logoLightHint}
        issues={issues}
        render={(controlProps) => (
          <AssetSelect
            {...controlProps}
            assets={assets}
            value={form.watch('logoLightAssetId') ?? null}
            onChange={(value) => form.setValue('logoLightAssetId', value, { shouldValidate: true })}
          />
        )}
      />

      <SettingsField
        name="logoDarkAssetId"
        label={copy.admin.settings.logoDark}
        description={copy.admin.settings.logoDarkHint}
        issues={issues}
        render={(controlProps) => (
          <AssetSelect
            {...controlProps}
            assets={assets}
            value={form.watch('logoDarkAssetId') ?? null}
            onChange={(value) => form.setValue('logoDarkAssetId', value, { shouldValidate: true })}
          />
        )}
      />

      <SettingsField
        name="faviconAssetId"
        label={copy.admin.settings.favicon}
        issues={issues}
        render={(controlProps) => (
          <AssetSelect
            {...controlProps}
            assets={assets}
            value={form.watch('faviconAssetId') ?? null}
            onChange={(value) => form.setValue('faviconAssetId', value, { shouldValidate: true })}
          />
        )}
      />

      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? copy.admin.common.saving : copy.admin.common.save}
        </Button>
      </div>
    </form>
  );
}
