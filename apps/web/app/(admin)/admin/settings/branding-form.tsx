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
  LANDING_LAYOUTS,
  LANDING_PRESETS,
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

/**
 * A drawing of each shape, not a word for it.
 *
 * «مقالي» and «مضغوط» mean nothing until you have seen them, and a radio list
 * of three Arabic adjectives is a choice made blind. Each preview is three
 * divs — the opener, then two content rows — sized and aligned the way that
 * layout actually renders, so the difference an admin is picking between is
 * the difference they can see.
 *
 * Deliberately monochrome: this control chooses a SHAPE. The colour is
 * `accentHue`'s job right above it, and tinting these would suggest the two
 * settings are one.
 */
/**
 * WHICH page, as opposed to what shape that page takes.
 *
 * Deliberately NOT given a `LayoutPreview`-style drawing. Those three previews
 * work because the thing they draw is a shape and nothing else — monochrome on
 * purpose, so an admin cannot read a colour into a control that does not set
 * one. A preset is a whole page: its colour, its typeface and its structure all
 * move together, and a 66px monochrome sketch of «الترمينال» next to one of
 * «اللوح» would be two near-identical grey rectangles claiming to show the
 * difference between them. A wrong drawing is worse than none, so this picker
 * is the label and the one-line hint, in the same `SettingsField` +
 * `RadioGroup` shape as every other control on this form.
 */
const PRESET_LABEL: Record<(typeof LANDING_PRESETS)[number], { name: string; hint: string }> = {
  classic: {
    name: copy.admin.settings.landingPresetClassic,
    hint: copy.admin.settings.landingPresetClassicHint,
  },
  neon: {
    name: copy.admin.settings.landingPresetNeon,
    hint: copy.admin.settings.landingPresetNeonHint,
  },
  board: {
    name: copy.admin.settings.landingPresetBoard,
    hint: copy.admin.settings.landingPresetBoardHint,
  },
};

const LAYOUT_LABEL: Record<(typeof LANDING_LAYOUTS)[number], { name: string; hint: string }> = {
  classic: {
    name: copy.admin.settings.landingLayoutClassic,
    hint: copy.admin.settings.landingLayoutClassicHint,
  },
  editorial: {
    name: copy.admin.settings.landingLayoutEditorial,
    hint: copy.admin.settings.landingLayoutEditorialHint,
  },
  compact: {
    name: copy.admin.settings.landingLayoutCompact,
    hint: copy.admin.settings.landingLayoutCompactHint,
  },
};

function LayoutPreview({ layout }: { layout: (typeof LANDING_LAYOUTS)[number] }) {
  const stageHeight = layout === 'classic' ? 34 : layout === 'editorial' ? 26 : 18;
  const rowGap = layout === 'compact' ? 2 : layout === 'editorial' ? 7 : 4;
  const darkStage = layout !== 'editorial';

  return (
    <span
      aria-hidden="true"
      className="flex w-[66px] shrink-0 flex-col overflow-hidden rounded-[3px] border border-line bg-bg text-fg"
      style={{ gap: rowGap }}
    >
      {/* The opener. Dark and ranged for classic, dark and short for compact,
          light and centred for editorial — the three differences an admin is
          actually choosing between. `currentColor` throughout, so the preview
          needs no colour token of its own and reads in either theme. */}
      <span
        className={`flex items-end px-1.5 pb-1 ${darkStage ? 'bg-fg' : 'border-b border-line'}`}
        style={{
          height: stageHeight,
          justifyContent: layout === 'classic' ? 'flex-start' : 'center',
        }}
      >
        <span
          className={`block rounded-[1px] ${darkStage ? 'bg-bg' : 'bg-fg'}`}
          style={{ height: layout === 'editorial' ? 5 : 3, width: layout === 'editorial' ? 34 : 26 }}
        />
      </span>

      {/* Three content cells: filled for classic and compact, outlined for
          editorial, where content sits on the page rather than on a card. */}
      <span className="flex gap-1 px-1.5" style={{ paddingBottom: rowGap }}>
        {[0, 1, 2].map((cell) => (
          <span
            key={cell}
            className={
              layout === 'editorial'
                ? 'flex-1 rounded-[2px] border border-line'
                : 'flex-1 rounded-[2px] bg-fg/12'
            }
            style={{ height: layout === 'compact' ? 9 : 12 }}
          />
        ))}
      </span>
    </span>
  );
}

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

      {/*
        ⚠️ ABOVE the shape picker, and the order is the meaning: this control
        decides which page renders, and the one under it only has an effect
        once that answer is «كلاسيك». Reading them the other way round — shape
        first, then page — is how an instructor ends up choosing a shape, then
        a preset that discards it, and reporting that the shape setting does
        not save.
      */}
      <SettingsField
        name="landingPreset"
        label={copy.admin.settings.landingPreset}
        description={copy.admin.settings.landingPresetHint}
        issues={issues}
        render={(controlProps) => (
          <RadioGroup
            {...controlProps}
            value={form.watch('landingPreset') ?? defaultValues.landingPreset}
            onValueChange={(value) =>
              form.setValue('landingPreset', value as Branding['landingPreset'], {
                shouldValidate: true,
              })
            }
            aria-label={copy.admin.settings.landingPreset}
          >
            {LANDING_PRESETS.map((preset) => (
              <label key={preset} className="flex items-start gap-3 py-1">
                <RadioGroupItem value={preset} />
                <span className="flex flex-col">
                  <span className="text-fg">{PRESET_LABEL[preset].name}</span>
                  <span className="text-[length:var(--fs-text-sm)] text-fg-muted">
                    {PRESET_LABEL[preset].hint}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        )}
      />

      <SettingsField
        name="landingLayout"
        label={copy.admin.settings.landingLayout}
        description={copy.admin.settings.landingLayoutHint}
        issues={issues}
        render={(controlProps) => (
          <RadioGroup
            {...controlProps}
            value={form.watch('landingLayout') ?? defaultValues.landingLayout}
            onValueChange={(value) =>
              form.setValue('landingLayout', value as Branding['landingLayout'], {
                shouldValidate: true,
              })
            }
            aria-label={copy.admin.settings.landingLayout}
          >
            {LANDING_LAYOUTS.map((layout) => (
              <label key={layout} className="flex items-start gap-3 py-1">
                <RadioGroupItem value={layout} />
                <LayoutPreview layout={layout} />
                <span className="flex flex-col">
                  <span className="text-fg">{LAYOUT_LABEL[layout].name}</span>
                  <span className="text-[length:var(--fs-text-sm)] text-fg-muted">
                    {LAYOUT_LABEL[layout].hint}
                  </span>
                </span>
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
