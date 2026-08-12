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
import { AssetSelect } from './asset-select';
import { SettingsField, issuesFromErrors } from './settings-field';
import { updateSeoAction } from './actions';

export interface SeoFormProps {
  defaultValues: Seo;
  assets: readonly MediaAsset[];
}

/** See `branding-form.tsx`'s identical comment: `SeoSchema`'s `.default(...)`
 *  fields make the Zod INPUT type optional, so `useForm` needs the
 *  three-generic form to keep `onSubmit` typed against the OUTPUT (`Seo`). */
type SeoFormValues = z.input<typeof SeoSchema>;

export function SeoForm({ defaultValues, assets }: SeoFormProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<SeoFormValues, unknown, Seo>({
    resolver: zodResolver(SeoSchema),
    defaultValues,
  });
  const issues = issuesFromErrors(form.formState.errors);

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
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
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
          <AssetSelect
            {...controlProps}
            assets={assets}
            value={form.watch('ogImageAssetId') ?? null}
            onChange={(value) => form.setValue('ogImageAssetId', value, { shouldValidate: true })}
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
