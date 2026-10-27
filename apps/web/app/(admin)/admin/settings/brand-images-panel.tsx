'use client';

import { Moon, Sun } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import {
  BRAND_IMAGE_GROUPS,
  BRAND_IMAGE_SLOTS,
  type BrandImageGroup,
  type BrandImageSlot,
  type BrandImageSlotDef,
} from '@ayman/contracts/admin/brand-images';
import type { z } from 'zod';
import type { Branding, BrandingSchema } from '@ayman/contracts/admin/settings';
import type { MediaAsset } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { mediaUrl } from '@ayman/ui/branding';
import { cn } from '@ayman/ui/lib/cn';
import { AssetPicker } from '@/components/admin/asset-picker';

const s = copy.admin.settings;

const SLOT_COPY: Record<BrandImageSlot, { name: string; hint: string }> = {
  logo: { name: s.slotLogo, hint: s.slotLogoHint },
  mark: { name: s.slotMark, hint: s.slotMarkHint },
  favicon: { name: s.slotFavicon, hint: s.slotFaviconHint },
  hero: { name: s.heroImage, hint: s.heroImageHint },
  portrait: { name: s.portraitImage, hint: s.portraitImageHint },
  trackEssentials: { name: s.slotTrackEssentials, hint: s.slotTrackEssentialsHint },
  trackYear1: { name: s.slotTrackYear1, hint: s.slotTrackYear1Hint },
  trackYear2: { name: s.slotTrackYear2, hint: s.slotTrackYear2Hint },
  login: { name: s.loginImage, hint: s.loginImageHint },
  honorHost: { name: s.slotHonorHost, hint: s.slotHonorHostHint },
  practiceGuide: { name: s.slotPracticeGuide, hint: s.slotPracticeGuideHint },
  courseCover: { name: s.slotCourseCover, hint: s.slotCourseCoverHint },
  appIcon: { name: s.slotAppIcon, hint: s.slotAppIconHint },
  signature: { name: s.slotSignature, hint: s.slotSignatureHint },
};

const GROUP_LABEL: Record<BrandImageGroup, string> = {
  identity: s.imagesGroupIdentity,
  landing: s.imagesGroupLanding,
  pages: s.imagesGroupPages,
  documents: s.imagesGroupDocuments,
};

type Source = 'uploaded' | 'builtIn' | 'none';

const SOURCE_LABEL: Record<Source, string> = {
  uploaded: s.sourceUploaded,
  builtIn: s.sourceBuiltIn,
  none: s.sourceNone,
};

/**
 * Every picture on the platform, one card each, light beside dark.
 *
 * ## What each tile shows when nothing is chosen in it
 *
 * Not «مفيش صورة». The site is serving SOMETHING in almost every slot — on
 * Ayman's stack, a file shipped in `public/brand/` — and a blank tile next to
 * a live picture is how an instructor ends up uploading the same photograph
 * a second time. So an empty light tile shows the platform's own file
 * (`builtIn`, resolved by the server page under the same tenant gate the site
 * uses), and an empty dark tile shows whatever the light one resolves to,
 * labelled «نفس صورة الفاتح», because that is exactly what dark mode renders.
 *
 * `offered` drops the slots this stack never renders — the year posters on a
 * stack whose landing has no poster cards, the practice photo where there is
 * no practice page — so every card on this screen changes something a
 * visitor can see.
 */
export function BrandImagesPanel({
  form,
  assets,
  builtIn,
  offered,
}: {
  /** `BrandingForm`'s own instance — see its note on the three generics. */
  form: UseFormReturn<z.input<typeof BrandingSchema>, unknown, Branding>;
  assets: readonly MediaAsset[];
  builtIn: Partial<Record<BrandImageSlot, string>>;
  offered: readonly BrandImageSlot[];
}) {
  const values = form.watch();

  const srcOf = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const asset = assets.find((row) => row.id === id);
    return asset ? mediaUrl(asset.storageKey) : null;
  };

  /** The light picture the site shows when this slot's light field is empty. */
  const lightFallback = (def: BrandImageSlotDef): string | null => {
    if (def.slot === 'mark') {
      // The circle falls back to the logo upload before the shipped file —
      // the order `app/layout.tsx` and `site-brand-slot.tsx` read it in.
      return srcOf(values.logoDarkAssetId) ?? srcOf(values.logoLightAssetId) ?? builtIn.mark ?? null;
    }
    return builtIn[def.slot] ?? null;
  };

  const slots = BRAND_IMAGE_SLOTS.filter((def) => offered.includes(def.slot));
  const sourceOf = (def: BrandImageSlotDef): Source =>
    values[def.light] ? 'uploaded' : lightFallback(def) ? 'builtIn' : 'none';
  const counts = { uploaded: 0, builtIn: 0, none: 0 };
  for (const def of slots) counts[sourceOf(def)] += 1;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
        {formatCopy(s.imagesSummary, {
          uploaded: String(counts.uploaded),
          builtIn: String(counts.builtIn),
          empty: String(counts.none),
        })}
      </p>

      {BRAND_IMAGE_GROUPS.map((group) => {
        const rows = slots.filter((def) => def.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-3" aria-labelledby={`brand-images-${group}`}>
            <h3 id={`brand-images-${group}`} className="text-[length:var(--fs-text-lg)] font-semibold text-fg">
              {GROUP_LABEL[group]}
            </h3>
            <div className="grid gap-4 xl:grid-cols-2">
              {rows.map((def) => {
                const source = sourceOf(def);
                const lightId = values[def.light] ?? null;
                const dark = def.dark;
                const darkId = dark ? (values[dark] ?? null) : null;
                const fallback = lightFallback(def);
                const lightNow = srcOf(lightId) ?? fallback;
                return (
                  <article
                    key={def.slot}
                    id={`slot-${def.slot}`}
                    className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-line bg-surface-1 p-4"
                  >
                    <header className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold text-fg">{SLOT_COPY[def.slot].name}</h4>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)]',
                            source === 'uploaded' && 'bg-accent/12 text-accent-text',
                            source === 'builtIn' && 'bg-surface-3 text-fg',
                            source === 'none' && 'bg-surface-2 text-fg-muted',
                          )}
                        >
                          {SOURCE_LABEL[source]}
                        </span>
                      </div>
                      <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{SLOT_COPY[def.slot].hint}</p>
                    </header>

                    {def.slot === 'appIcon' ? <AppIconCheck asset={assets.find((row) => row.id === lightId)} /> : null}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <span className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">
                          <Sun size={14} aria-hidden="true" />
                          {s.modeLight}
                        </span>
                        <AssetPicker
                          slot={def.slot}
                          layout="tile"
                          tone="light"
                          assets={assets}
                          value={lightId}
                          current={fallback ? { src: fallback, label: s.sourceBuiltIn } : null}
                          onChange={(value) =>
                            form.setValue(def.light, value, { shouldValidate: true, shouldDirty: true })
                          }
                        />
                      </div>
                      {/* One file only (the app icon): no dark column at all,
                          rather than a control that changes nothing. */}
                      {dark ? (
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <span className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">
                            <Moon size={14} aria-hidden="true" />
                            {s.modeDark}
                          </span>
                          <AssetPicker
                            slot={def.slot}
                            layout="tile"
                            tone="dark"
                            assets={assets}
                            value={darkId}
                            current={lightNow ? { src: lightNow, label: s.sourceSameAsLight } : null}
                            onChange={(value) =>
                              form.setValue(dark, value, { shouldValidate: true, shouldDirty: true })
                            }
                          />
                          {darkId === null ? (
                            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{s.darkOptional}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The launcher icon is served through Next's optimiser, which never upscales:
 * a 300px file declared as 640×640 in the manifest arrives at 300, and a
 * non-square one arrives letterboxed. Said here, at the moment of choosing,
 * because nothing on the site shows it until a student installs the app.
 */
function AppIconCheck({ asset }: { asset: MediaAsset | undefined }) {
  if (!asset?.width || !asset.height) return null;
  if (asset.width === asset.height && asset.width >= 512) return null;
  return (
    <p role="alert" className="text-[length:var(--fs-text-sm)] text-warn">
      {formatCopy(s.appIconTooSmall, { w: String(asset.width), h: String(asset.height) })}
    </p>
  );
}
