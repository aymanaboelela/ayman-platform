'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SeoSchema, type Seo } from '@ayman/contracts/admin/settings';
import type { MediaAsset } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Textarea } from '@ayman/ui/components/textarea';
import { OG_PAGES, type OgPage } from '@ayman/contracts/admin/seo-pages';
import { mediaUrl } from '@ayman/ui/branding';
import { AssetPicker } from '@/components/admin/asset-picker';
import { SettingsField, issuesFromErrors } from './settings-field';
import { updateSeoAction } from './actions';

export interface SeoFormProps {
  defaultValues: Seo;
  assets: readonly MediaAsset[];
  /** The share image the site serves with nothing set — `/og.jpg` on his stack. */
  builtInShare?: string;
}

const s = copy.admin.settings;

const PAGE_LABEL: Record<OgPage, string> = {
  courses: s.seoPageCourses,
  books: s.seoPageBooks,
  about: s.seoPageAbout,
  honorBoard: s.seoPageHonorBoard,
  practice: s.seoPagePractice,
  news: s.seoPageNews,
  links: s.seoPageLinks,
  subscribe: s.seoPageSubscribe,
};

/** See `branding-form.tsx`'s identical comment: `SeoSchema`'s `.default(...)`
 *  fields make the Zod INPUT type optional, so `useForm` needs the
 *  three-generic form to keep `onSubmit` typed against the OUTPUT (`Seo`). */
type SeoFormValues = z.input<typeof SeoSchema>;

export function SeoForm({ defaultValues, assets, builtInShare }: SeoFormProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<SeoFormValues, unknown, Seo>({
    resolver: zodResolver(SeoSchema),
    defaultValues,
  });
  const issues = issuesFromErrors(form.formState.errors);

  /* What a page with nothing of its own shares: the site-wide picture above,
     else the shipped file. Shown in each empty page tile so nobody uploads
     the same picture eight times to get the default. */
  const generalId = form.watch('ogImageAssetId') ?? null;
  const generalAsset = generalId ? assets.find((asset) => asset.id === generalId) : undefined;
  const generalSrc = generalAsset ? mediaUrl(generalAsset.storageKey) : builtInShare;

  async function onSubmit(values: Seo) {
    setSaveError(null);
    const result = await updateSeoAction(values);
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
        name="titleAr"
        label={copy.admin.settings.seoTitle}
        description={copy.admin.settings.seoTitleHint}
        issues={issues}
        render={(controlProps) => <Input {...controlProps} {...form.register('titleAr')} maxLength={70} />}
      />

      <SettingsField
        name="descriptionAr"
        label={copy.admin.settings.seoDescription}
        description={copy.admin.settings.seoDescriptionHint}
        issues={issues}
        render={(controlProps) => (
          <Textarea {...controlProps} {...form.register('descriptionAr')} maxLength={160} />
        )}
      />

      <SettingsField
        name="ogImageAssetId"
        label={copy.admin.settings.ogImage}
        issues={issues}
        render={(controlProps) => (
          <AssetPicker
            {...controlProps}
            slot="share"
            assets={assets}
            value={form.watch('ogImageAssetId') ?? null}
            current={builtInShare ? { src: builtInShare, label: s.sourceBuiltIn } : null}
            onChange={(value) => form.setValue('ogImageAssetId', value, { shouldValidate: true })}
          />
        )}
      />

      <section className="flex flex-col gap-3" aria-labelledby="seo-pages">
        <div className="flex flex-col gap-1">
          <h3 id="seo-pages" className="font-semibold text-fg">
            {s.seoPagesTitle}
          </h3>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{s.seoPagesHint}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {OG_PAGES.map((def) => (
            <div key={def.page} className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">{PAGE_LABEL[def.page]}</span>
              <AssetPicker
                slot="share"
                layout="tile"
                assets={assets}
                value={form.watch(def.field) ?? null}
                current={generalSrc ? { src: generalSrc, label: s.ogImage } : null}
                onChange={(value) => form.setValue(def.field, value, { shouldValidate: true })}
              />
            </div>
          ))}
        </div>
      </section>

      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? copy.admin.common.saving : copy.admin.common.save}
        </Button>
      </div>
    </form>
  );
}
