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
import { accentRamp } from '@ayman/ui/ramp';
import { formatOklch } from '@ayman/ui/oklch';
import { Button } from '@ayman/ui/components/button';
import { RadioGroup, RadioGroupItem } from '@ayman/ui/components/radio-group';
import { Select } from '@ayman/ui/components/select';
import { AssetPicker } from '@/components/admin/asset-picker';
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

/** The radio value for "not a slot". Cannot collide — `ACCENT_SLOTS` are plain words. */
const CUSTOM = '__custom__';

/**
 * Where the slider starts when «لون خاص» is first chosen.
 *
 * 258 is the shipped blue: a hue that is already known to clear every contrast
 * target, so the first thing an admin sees after switching is a working scheme
 * rather than whatever 0° happens to be.
 */
const DEFAULT_CUSTOM_HUE = 258;

/**
 * The slider's own background, built from the generator rather than a raw
 * `hsl()` rainbow — so the track shows the colours this platform would
 * actually produce, at the lightness it would produce them.
 */
const HUE_STOPS = Array.from({ length: 25 }, (_, index) => {
  const stop = index * 15;
  return { hue: stop, css: formatOklch(accentRamp(stop % 360, 'light')[0]) };
});

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
 * The colour picker is a `RadioGroup` over `ACCENT_SLOTS` plus one more option
 * — never a free-text or `<input type="color">` control (Global Constraint
 * 18 / A12). Each slot's swatch renders that slot's OWN step-9 value from
 * `ACCENT_RAMPS` (the same table `renderBrandingStyle` renders from), so the
 * preview is exactly what saving would apply, not an approximation.
 *
 * ## The seventh option
 *
 * «لون خاص» reveals a hue SLIDER, and the value it stores is a NUMBER from 0
 * to 359 — not a colour string. The constraint above is about an editor being
 * able to put arbitrary text into a `<style>` tag; a bounded integer that the
 * server turns into OKLCH through `accentRamp` cannot do that, and the schema
 * rejects the bands around `--ok` and `--err` so a brand can never be mistaken
 * for «إجابة صح».
 *
 * It exists because the slot picker is only half a picker: switching slots
 * rewrites `--a-9…--a-12` and leaves the eleven `--p-*` steps on their
 * hand-tuned amber, which is 116 usages including the landing page's own
 * stylesheets. A hue regenerates both.
 *
 * Its swatch also comes from the real generator, so what the slider previews
 * is what the page will render.
 */
export function BrandingForm({ defaultValues, assets }: BrandingFormProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<BrandingFormValues, unknown, Branding>({
    resolver: zodResolver(BrandingSchema),
    defaultValues,
  });
  const issues = issuesFromErrors(form.formState.errors);

  /*
   * `accentHue` is the source of truth for which radio is selected: a stored
   * hue means the tenant chose their own colour, whatever `accent` still says.
   * Keeping the radio's value derived rather than in its own state is what
   * stops the two disagreeing after a failed save.
   */
  const watchedHue = form.watch('accentHue');
  const isCustom = typeof watchedHue === 'number';
  const hue = isCustom ? watchedHue : DEFAULT_CUSTOM_HUE;
  const swatch = formatOklch(accentRamp(hue, 'light')[0]);

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
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
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
            value={isCustom ? CUSTOM : (form.watch('accent') ?? defaultValues.accent)}
            onValueChange={(value) => {
              // The two fields are one choice, so they are always written
              // together: a leftover hue beside a chosen slot would silently
              // win at render, because `renderBrandingStyle` prefers the hue.
              if (value === CUSTOM) {
                form.setValue('accentHue', hue, { shouldValidate: true });
                return;
              }
              form.setValue('accentHue', null, { shouldValidate: true });
              form.setValue('accent', value as Branding['accent'], { shouldValidate: true });
            }}
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
            <label className="flex items-center gap-3">
              <RadioGroupItem value={CUSTOM} />
              <span
                aria-hidden="true"
                className="size-5 shrink-0 rounded-full border border-line"
                style={{ background: swatch }}
              />
              <span className="text-fg">{copy.admin.settings.accentCustom}</span>
            </label>
          </RadioGroup>
        )}
      />

      {isCustom ? (
        <SettingsField
          name="accentHue"
          label={copy.admin.settings.accentHue}
          description={copy.admin.settings.accentHueHint}
          issues={issues}
          render={(controlProps) => (
            <div className="flex items-center gap-3">
              <input
                {...controlProps}
                type="range"
                min={0}
                max={359}
                step={1}
                value={hue}
                onChange={(event) =>
                  form.setValue('accentHue', Number(event.target.value), { shouldValidate: true })
                }
                className="h-2 w-full cursor-pointer appearance-none rounded-full"
                /* The track IS the choice, so it shows every hue at the
                   lightness the generator will actually use. A grey slider
                   beside a swatch makes the admin guess. */
                style={{
                  background:
                    'linear-gradient(to right, ' +
                    HUE_STOPS.map((stop) => stop.css).join(', ') +
                    ')',
                }}
              />
              <output className="w-12 shrink-0 text-end tabular-nums text-fg">{hue}°</output>
            </div>
          )}
        />
      ) : null}

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
          <AssetPicker
            {...controlProps}
            slot="logo"
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
          <AssetPicker
            {...controlProps}
            slot="logo"
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
          <AssetPicker
            {...controlProps}
            slot="favicon"
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
