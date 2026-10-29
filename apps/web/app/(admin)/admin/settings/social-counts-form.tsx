'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  SOCIAL_COUNT_NETWORKS,
  SocialCountsInputSchema,
  shortFollowerCount,
  type SocialCountNetwork,
  type SocialCountsInput,
} from '@ayman/contracts/admin/social-counts';
import { copy } from '@ayman/contracts/copy/admin';
import { socialCountsCopy } from '@ayman/contracts/copy/social-counts';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { SettingsField, issuesFromErrors } from './settings-field';
import { updateSocialCountsAction } from './actions';

const c = socialCountsCopy;

export interface SocialCountsFormProps {
  defaultValues: SocialCountsInput;
  /** «آخر تحديث», already formatted by the page; `null` = never saved. */
  lastUpdated: string | null;
  /** Whether the landing page has a profile to link each count to. */
  linked: Record<SocialCountNetwork, boolean>;
  /**
   * The networks the API keeps itself (`isAutoSynced`), each with its last
   * sync, formatted. A network absent here is typed like the rest.
   */
  autoSyncedAt?: Partial<Record<SocialCountNetwork, string>>;
}

/** See `shipping-form.tsx`: `.default()` fields make the Zod INPUT optional. */
type SocialCountsFormValues = z.input<typeof SocialCountsInputSchema>;

/**
 * «عدد السوشيال ميديا» — four numbers, typed as they appear on each profile.
 *
 * Controlled rather than `register`ed for the same reason as the contact
 * form: an empty input has to become `null` ("not entered", renders nothing)
 * before it reaches the shared schema, and `Number('')` would make it `0`.
 *
 * Under each field, the figure exactly as the landing page will print it —
 * the rounding is deliberate (always down, «+» when it did) and the admin
 * should see it before a visitor does.
 */
export function SocialCountsForm({ defaultValues, lastUpdated, linked, autoSyncedAt = {} }: SocialCountsFormProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<SocialCountsFormValues, unknown, SocialCountsInput>({
    resolver: zodResolver(SocialCountsInputSchema),
    defaultValues,
  });
  const issues = issuesFromErrors(form.formState.errors);

  function setCount(network: SocialCountNetwork, raw: string) {
    // Thousands separators are how these numbers are copied off a profile.
    const digits = raw.replace(/[\s,٬]/g, '');
    form.setValue(network, digits === '' ? null : Number(digits), { shouldValidate: true });
  }

  async function onSubmit(values: SocialCountsInput) {
    setSaveError(null);
    const result = await updateSocialCountsAction(values);
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

      <p className="text-[length:var(--fs-text-sm)] text-muted">{c.admin.note}</p>

      {SOCIAL_COUNT_NETWORKS.map((network) => {
        const value = form.watch(network);
        /*
         * Read-only rather than an override: the next daily sync would undo
         * an override anyway, and the API's save keeps the synced figure
         * whatever is sent (`SettingsService.updateSocialCounts`). The field
         * becomes typable again by itself once the sync goes quiet.
         */
        const syncedAt = autoSyncedAt[network];
        const auto = syncedAt !== undefined;
        const hints = [
          auto ? formatCopy(c.admin.autoSynced, { network: c.networks[network].name, date: syncedAt }) : null,
          typeof value === 'number' && Number.isInteger(value) && value > 0
            ? formatCopy(c.admin.preview, { preview: `${shortFollowerCount(value)} ${c.networks[network].unit}` })
            : null,
          linked[network] ? null : c.admin.noLink,
        ].filter((hint): hint is string => hint !== null);

        return (
          <SettingsField
            key={network}
            name={network}
            label={c.networks[network].name}
            description={hints.length > 0 ? hints.join(' · ') : undefined}
            issues={issues}
            render={(controlProps) => (
              <Input
                {...controlProps}
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={value ?? ''}
                readOnly={auto}
                onChange={(event) => setCount(network, event.target.value)}
              />
            )}
          />
        );
      })}

      <p className="text-[length:var(--fs-text-sm)] text-muted">
        {lastUpdated ? formatCopy(c.admin.lastUpdated, { date: lastUpdated }) : c.admin.neverUpdated}
      </p>

      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? copy.admin.common.saving : copy.admin.common.save}
        </Button>
      </div>
    </form>
  );
}
