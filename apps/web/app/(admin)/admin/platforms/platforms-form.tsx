'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { FeatureDeclaration } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import type { ControlPlaneTenant } from '@/lib/control-plane';
import { SettingsField, issuesFromErrors } from '../settings/settings-field';
import { signEntitlementsAction } from './actions';
import { DEFAULT_DAYS, SignRequestSchema, defaultFeatureValues, type SignRequest } from './schema';

/** Latin digits inside Arabic, like every other date on the platform. */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'long' });

export interface PlatformsFormProps {
  tenants: readonly ControlPlaneTenant[];
  features: readonly FeatureDeclaration[];
}

/**
 * Pick an instructor, tick what runs on their platform, get a signed document.
 *
 * ## The form follows `admin/settings`, the output does not
 *
 * `useForm` + `zodResolver` + `SettingsField` + a toast is the same shape as
 * `shipping-form.tsx`. What is different is the end: every other admin form
 * SAVES, and the screen's job is over once the toast fires. This one produces
 * a string that still has to be carried by hand to another panel, so the token
 * and the two lines telling you where to put it are the result — not a
 * confirmation of one.
 *
 * ## All nine boxes are live, and what an untick means
 *
 * The document states every declared key explicitly, so an unticked box is a
 * `false` the instructor's stack honours. That is what makes «صبري مش هيعرض
 * كتب» something this screen can do, instead of a change to
 * `FEATURE_DECLARATIONS` that would land on all three platforms at once.
 *
 * The boxes START at `defaultForTenant`, so an untouched form re-states what
 * that stack already runs and every difference is one Ayman made on purpose.
 * Starting them all off would make a hurried save read as a shutdown.
 *
 * ⚠️ Unticking is NOT the same as never signing. With no document at all the
 * declared defaults apply — so a token whose job is to CLOSE something has to
 * be renewed before `exp` or the feature comes back on its own. That is what
 * the expiry line under the token is for, and why the day count is on the
 * same screen as the boxes rather than buried in the runbook.
 */
export function PlatformsForm({ tenants, features }: PlatformsFormProps) {
  const c = copy.admin.platforms;
  const tokenRef = useRef<HTMLTextAreaElement>(null);
  const [signed, setSigned] = useState<{ token: string; expiresAt: number } | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<SignRequest>({
    resolver: zodResolver(SignRequestSchema),
    defaultValues: {
      // One instructor is the common case; a picker that starts empty adds a
      // click to every signing for no gain.
      tenantKey: tenants[0]?.key ?? '',
      days: DEFAULT_DAYS,
      features: defaultFeatureValues(),
    },
  });
  const issues = issuesFromErrors(form.formState.errors);

  async function onSubmit(values: SignRequest) {
    setSignError(null);
    setCopied(false);
    const result = await signEntitlementsAction(values);
    if (result.ok) {
      setSigned({ token: result.token, expiresAt: result.expiresAt });
      toast.success(copy.admin.common.saved);
    } else {
      // The previous token stays on screen on purpose — a failed re-sign
      // should not take away the one that was already copied.
      setSignError(result.message);
      toast.error(result.message);
    }
  }

  async function copyToken() {
    if (!signed) return;
    /*
     * Two paths, for the reason written out in `subscribe-panel.tsx`:
     * `navigator.clipboard` needs a secure context and can be refused by
     * permissions policy outright. `execCommand('copy')` against a focused,
     * selected textarea still works where it is.
     */
    try {
      await navigator.clipboard.writeText(signed.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    } catch {
      // Fall through.
    }

    const field = tokenRef.current;
    if (!field) return;
    try {
      field.focus();
      field.select();
      if (document.execCommand('copy')) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Both refused. The token is selected on screen; nothing else to do.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        method="post"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col gap-6"
      >
        <Card>
          <CardBody className="flex flex-col gap-5">
            <SettingsField
              name="tenantKey"
              label={c.tenantLabel}
              description={c.tenantHint}
              issues={issues}
              render={(controlProps) => (
                <Select {...controlProps} {...form.register('tenantKey')}>
                  {tenants.map((tenant) => (
                    <option key={tenant.key} value={tenant.key}>
                      {/* The slug beside the name: it is the thing that has to
                          match `TENANT_KEY`, and the name is only there so the
                          picker is readable. */}
                      {tenant.name} — {tenant.key}
                    </option>
                  ))}
                </Select>
              )}
            />

            <SettingsField
              name="days"
              label={c.daysLabel}
              description={c.daysHint}
              issues={issues}
              render={(controlProps) => (
                <Input
                  {...controlProps}
                  type="number"
                  min={1}
                  max={730}
                  step={1}
                  dir="ltr"
                  // Controlled and coerced here, like `shipping-form.tsx`: a
                  // number input hands back a string, and `z.number()` would
                  // fail with a message about a type rather than about a
                  // length.
                  value={form.watch('days')}
                  onChange={(event) =>
                    form.setValue('days', Number(event.target.value), { shouldValidate: true })
                  }
                />
              )}
            />
          </CardBody>
        </Card>

        <div>
          <div className="group-head">
            <span className="group-head__mark" aria-hidden="true" />
            <h2 className="group-head__title">{c.featuresTitle}</h2>
            <span className="group-head__note">{c.featuresLead}</span>
          </div>

          <Card>
            <CardBody className="divide-y divide-line-subtle">
              {features.map((feature) => {
                /*
                  ⚠️ The WHOLE `features` object, never `features.${key}`.
                  Two keys carry a dot — `marketing.whatsapp`, `video.upload` —
                  and react-hook-form reads a dot in a field path as nesting:
                  `setValue('features.video.upload', true)` wrote
                  `{ video: { upload: true } }`, the schema's
                  `record(string, boolean)` refused the object under `video`,
                  and the submit died in validation with no field to show the
                  error on. Ticking «رفع الفيديو» or «حملات الواتساب» made the
                  sign button do nothing at all.
                */
                const on = form.watch('features')[feature.key] === true;
                return (
                  <label key={feature.key} className="flex items-center justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-fg">{feature.nameAr}</span>
                        <span
                          className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted"
                          // A Latin key like `video.upload` inside an Arabic
                          // row flips without these (CLAUDE.md §٧).
                          dir="ltr"
                          style={{ unicodeBidi: 'isolate' }}
                        >
                          {feature.key}
                        </span>
                      </span>
                      <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">
                        {feature.descriptionAr}
                      </span>
                      {/*
                        Which way this row started, said once per row rather
                        than as a legend somebody has to hold in their head:
                        unticking «الكتب» and unticking «الإذاعة» look
                        identical here and mean different amounts of change.
                      */}
                      <span className="mt-1 block text-[length:var(--fs-text-sm)] text-fg-muted">
                        {feature.defaultForTenant ? c.defaultOn : c.defaultOff}
                      </span>
                    </span>
                    <Checkbox
                      checked={on}
                      onCheckedChange={(checked) =>
                        form.setValue('features', {
                          ...form.getValues('features'),
                          [feature.key]: checked === true,
                        })
                      }
                      aria-label={feature.nameAr}
                    />
                  </label>
                );
              })}
            </CardBody>
          </Card>
        </div>

        {signError ? (
          <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
            {signError}
          </p>
        ) : null}

        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? c.signing : c.sign}
          </Button>
        </div>
      </form>

      {signed ? (
        <div>
          <div className="group-head">
            <span className="group-head__mark" aria-hidden="true" />
            <h2 className="group-head__title">{c.tokenTitle}</h2>
            <span className="group-head__note">
              {c.expiresAt} {dateFormatter.format(new Date(signed.expiresAt * 1000))}
            </span>
          </div>

          <Card>
            <CardBody className="flex flex-col gap-3">
              <Textarea
                ref={tokenRef}
                readOnly
                value={signed.token}
                rows={4}
                aria-label={c.tokenTitle}
                className="font-mono text-[length:var(--fs-mono-label)]"
                // The token is Latin base64url in an RTL document. Without
                // both of these the three dot-separated segments render in the
                // wrong order and a copy by eye is wrong every time.
                dir="ltr"
                style={{ unicodeBidi: 'isolate' }}
              />

              <div>
                <Button type="button" variant="secondary" onClick={() => void copyToken()}>
                  {copied ? c.copied : c.copy}
                </Button>
              </div>

              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.tokenHint}</p>
              {/*
                The one thing that reads as a bug if it is not said here: the
                instructor's API reads `TENANT_ENTITLEMENTS` once, at boot
                (`loadEntitlements`). Pasting the value and walking away leaves
                the old entitlements running until something redeploys that
                stack — and CLAUDE.md §٣ is the wider version of the same rule.
              */}
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.tokenRebuildNote}</p>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
