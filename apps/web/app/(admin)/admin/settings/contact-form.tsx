'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ContactSchema, type Contact } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { SettingsField, issuesFromErrors } from './settings-field';
import { updateContactAction } from './actions';

export interface ContactFormProps {
  defaultValues: Contact;
}

/**
 * DERIVED from the contract, not re-typed beside it.
 *
 * This was a hand-written union of the six field names, and it drifted the
 * moment `ContactSchema` grew `instagram`, `tiktok`, `whatsappChannel` and
 * `facebookGroup` — a list whose only job is to mirror another list will.
 * Every member of `Contact` is a nullable string with the same empty-to-`null`
 * translation, so `keyof` is exact here rather than an approximation.
 */
type NullableTextField = keyof Contact;

/** See `branding-form.tsx`'s identical comment: `ContactSchema`'s
 *  `.default(null)` fields make the Zod INPUT type optional, so `useForm`
 *  needs the three-generic form to keep `onSubmit` typed against the OUTPUT
 *  (`Contact`). */
type ContactFormValues = z.input<typeof ContactSchema>;

/**
 * Every field on this form is `.nullable()` in the SHARED `ContactSchema` —
 * `""` is not a valid email / E.164 phone / https URL, so the native input's
 * "empty" state has to become `null` before it reaches that exact schema.
 * These are fully controlled (no `register`) so that translation happens at
 * the one place a value can enter the form, rather than as a second set of
 * validation rules layered on top of `ContactSchema`.
 */
export function ContactForm({ defaultValues }: ContactFormProps) {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<ContactFormValues, unknown, Contact>({
    resolver: zodResolver(ContactSchema),
    defaultValues,
  });
  const issues = issuesFromErrors(form.formState.errors);

  function setNullable(name: NullableTextField, raw: string) {
    const trimmed = raw.trim();
    form.setValue(name, trimmed === '' ? null : trimmed, { shouldValidate: true });
  }

  async function onSubmit(values: Contact) {
    setSaveError(null);
    const result = await updateContactAction(values);
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
        name="email"
        label={copy.admin.settings.email}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="email"
            dir="ltr"
            value={form.watch('email') ?? ''}
            onChange={(event) => setNullable('email', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="phone"
        label={copy.admin.settings.phone}
        description={copy.admin.settings.phoneHint}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="tel"
            dir="ltr"
            value={form.watch('phone') ?? ''}
            onChange={(event) => setNullable('phone', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="whatsapp"
        label={copy.admin.settings.whatsapp}
        description={copy.admin.settings.phoneHint}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="tel"
            dir="ltr"
            value={form.watch('whatsapp') ?? ''}
            onChange={(event) => setNullable('whatsapp', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="vodafoneCash"
        label={copy.admin.settings.vodafoneCash}
        description={copy.admin.settings.vodafoneCashHint}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="tel"
            dir="ltr"
            value={form.watch('vodafoneCash') ?? ''}
            onChange={(event) => setNullable('vodafoneCash', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="facebook"
        label={copy.admin.settings.facebook}
        description={copy.admin.settings.urlHttpsOnly}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="url"
            dir="ltr"
            value={form.watch('facebook') ?? ''}
            onChange={(event) => setNullable('facebook', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="youtube"
        label={copy.admin.settings.youtube}
        description={copy.admin.settings.urlHttpsOnly}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="url"
            dir="ltr"
            value={form.watch('youtube') ?? ''}
            onChange={(event) => setNullable('youtube', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="telegram"
        label={copy.admin.settings.telegram}
        description={copy.admin.settings.urlHttpsOnly}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="url"
            dir="ltr"
            value={form.watch('telegram') ?? ''}
            onChange={(event) => setNullable('telegram', event.target.value)}
          />
        )}
      />

      {/*
        The four the footer renders that this form could not reach. Two of them
        shipped pointing at `https://wa.me/` and
        `https://www.facebook.com/groups/` — bare platform roots — so the
        WhatsApp button and the community link sent students to WhatsApp's and
        Facebook's own front pages. See `ContactSchema`.
      */}
      <SettingsField
        name="instagram"
        label={copy.admin.settings.instagram}
        description={copy.admin.settings.urlHttpsOnly}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="url"
            dir="ltr"
            value={form.watch('instagram') ?? ''}
            onChange={(event) => setNullable('instagram', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="tiktok"
        label={copy.admin.settings.tiktok}
        description={copy.admin.settings.urlHttpsOnly}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="url"
            dir="ltr"
            value={form.watch('tiktok') ?? ''}
            onChange={(event) => setNullable('tiktok', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="whatsappChannel"
        label={copy.admin.settings.whatsappChannel}
        description={copy.admin.settings.whatsappChannelHint}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="url"
            dir="ltr"
            value={form.watch('whatsappChannel') ?? ''}
            onChange={(event) => setNullable('whatsappChannel', event.target.value)}
          />
        )}
      />

      {/* Directly under the channel, because the two are one keystroke apart
          and mean different things — «رسايل م. أيمن» invites students into
          THIS one and never falls back to the channel. See `ContactSchema`. */}
      <SettingsField
        name="whatsappGroup"
        label={copy.admin.settings.whatsappGroup}
        description={copy.admin.settings.whatsappGroupHint}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="url"
            dir="ltr"
            value={form.watch('whatsappGroup') ?? ''}
            onChange={(event) => setNullable('whatsappGroup', event.target.value)}
          />
        )}
      />

      <SettingsField
        name="facebookGroup"
        label={copy.admin.settings.facebookGroup}
        description={copy.admin.settings.facebookGroupHint}
        issues={issues}
        render={(controlProps) => (
          <Input
            {...controlProps}
            type="url"
            dir="ltr"
            value={form.watch('facebookGroup') ?? ''}
            onChange={(event) => setNullable('facebookGroup', event.target.value)}
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
