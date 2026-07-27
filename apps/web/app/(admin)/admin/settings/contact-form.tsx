'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ContactSchema, type Contact } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts';
import { Button, Input } from '@ayman/ui';
import { SettingsField, issuesFromErrors } from './settings-field';
import { updateContactAction } from './actions';

export interface ContactFormProps {
  defaultValues: Contact;
}

type NullableTextField = 'email' | 'phone' | 'whatsapp' | 'facebook' | 'youtube' | 'telegram';

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
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
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

      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? copy.admin.common.saving : copy.admin.common.save}
        </Button>
      </div>
    </form>
  );
}
