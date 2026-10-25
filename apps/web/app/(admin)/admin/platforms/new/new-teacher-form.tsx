'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Check, Globe, LayoutTemplate, Rocket, Sparkles, ToggleRight, UserRound, type LucideIcon } from 'lucide-react';
import type { FeatureDeclaration } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { ACCENT_SLOTS, type AccentSlot } from '@ayman/contracts/admin/settings';
import { SUBJECTS, subjectNameAr } from '@ayman/contracts/subjects';
import { GRADES } from '@ayman/contracts/grades';
import { ACCENT_RAMPS } from '@ayman/ui/branding';
import { cn } from '@ayman/ui/lib/cn';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Select } from '@ayman/ui/components/select';
import { cleanHost, databaseName, suggestTenantKey } from '@/lib/provisioning/names';
import { SettingsField, issuesFromErrors } from '../../settings/settings-field';
import { defaultFeatureValues } from '../schema';
import { provisionTenantAction, type ProvisionActionResult } from './actions';
import { ProvisionRun } from './provision-run';
import { ProvisionRequestSchema, defaultMediaHost, type ProvisionInput, type ProvisionRequest } from './schema';

const c = copy.admin.tenants;

export interface NewTeacherFormProps {
  features: readonly FeatureDeclaration[];
  /** Whether the run will write DNS itself, for the summary's last line. */
  cloudflare: boolean;
}

/**
 * The form, the summary beside it, and — once submitted — the run.
 *
 * ## Three fields fill themselves until they are touched
 *
 * The key, the media host and the admin's name are each derived from a field
 * typed before them (the domain, the domain, the display name), because the
 * derived value is right nine times in ten and typing it is where the tenth
 * goes wrong. The moment the owner edits one, it is his and stops following.
 *
 * ## The summary is the review step
 *
 * There is no «are you sure» dialog. What gets created is on screen the whole
 * time — the exact URL, the key that names the stack forever, the database
 * name — so the review happens while typing rather than in a modal nobody
 * reads. A wrong domain is caught here, not after a ten-minute build.
 */
export function NewTeacherForm({ features, cloudflare }: NewTeacherFormProps) {
  const [run, setRun] = useState<ProvisionActionResult | null>(null);
  const [touched, setTouched] = useState({ key: false, mediaHost: false, adminName: false });

  const form = useForm<ProvisionRequest, unknown, ProvisionInput>({
    resolver: zodResolver(ProvisionRequestSchema),
    defaultValues: {
      displayName: '',
      // No default: a preselected subject is how a maths teacher ends up with
      // a physics site. The empty option fails validation until one is picked.
      subject: '' as ProvisionRequest['subject'],
      grades: [],
      adminName: '',
      adminEmail: '',
      whatsapp: '',
      appHost: '',
      mediaHost: '',
      key: '',
      // Not his amber classic: a new teacher's page should not open looking
      // like the owner's. Both are one click to change.
      landingPreset: 'board',
      accent: 'blue',
      features: defaultFeatureValues(),
      shareKeys: true,
      youtube: '',
      instagram: '',
      tiktok: '',
      facebook: '',
      whatsappChannel: '',
    },
  });
  const issues = issuesFromErrors(form.formState.errors);
  const values = form.watch();

  async function onSubmit(input: ProvisionInput) {
    const result = await provisionTenantAction(input);
    setRun(result);
    if (!result.ok && 'field' in result && result.field) {
      form.setError(result.field as keyof ProvisionRequest, { message: result.error });
    }
    if (result.ok) toast.success(c.doneTitle);
    else toast.error(result.error ?? c.failedTitle);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const succeeded = run?.ok === true;

  return (
    <div className="flex flex-col gap-6">
      {run && run.steps.length > 0 ? <ProvisionRun result={run} teacherPhone={values.whatsapp ?? ''} /> : null}
      {run && !run.ok && run.steps.length === 0 ? (
        <p role="alert" className="rounded-lg border border-[color-mix(in_oklch,var(--err),transparent_60%)] bg-[color-mix(in_oklch,var(--err),transparent_92%)] p-3 text-[length:var(--fs-text-sm)] text-fg">
          {run.error}
        </p>
      ) : null}

      {succeeded ? null : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <form method="post" noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-6">
            <Section icon={UserRound} title={c.sectionTeacher} note={c.sectionTeacherNote} hue="var(--info)">
              <SettingsField
                name="displayName"
                label={c.displayName}
                description={c.displayNameHint}
                issues={issues}
                render={(props) => (
                  <Input
                    {...props}
                    {...form.register('displayName', {
                      onChange: (event: { target: { value: string } }) => {
                        if (!touched.adminName) form.setValue('adminName', event.target.value);
                      },
                    })}
                    autoComplete="off"
                  />
                )}
              />
              <SettingsField
                name="subject"
                label={c.subject}
                description={c.subjectHint}
                issues={issues}
                render={(props) => (
                  <Select
                    {...props}
                    {...form.register('subject', {
                      // «الترمينال» exists for programming only; leaving it
                      // selected under another subject would be refused.
                      onChange: (event: { target: { value: string } }) => {
                        if (event.target.value !== 'programming_cs' && form.getValues('landingPreset') === 'neon') {
                          form.setValue('landingPreset', 'board');
                        }
                        if (event.target.value === 'programming_cs') form.setValue('grades', []);
                      },
                    })}
                  >
                    <option value="" disabled>
                      {c.subjectChoose}
                    </option>
                    {SUBJECTS.map((subject) => (
                      <option key={subject.slug} value={subject.slug}>
                        {subject.nameAr}
                      </option>
                    ))}
                  </Select>
                )}
              />
              {values.subject && values.subject !== 'programming_cs' ? (
                <SettingsField
                  name="grades"
                  label={c.grades}
                  description={c.gradesHint}
                  issues={issues}
                  render={() => (
                    <div className="flex flex-wrap gap-2">
                      {GRADES.map((grade) => {
                        const on = (values.grades ?? []).includes(grade.slug);
                        return (
                          <button
                            key={grade.slug}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              const current = form.getValues('grades') ?? [];
                              // Kept in GRADES order — the order students see them in.
                              const next = on ? current.filter((g) => g !== grade.slug) : [...current, grade.slug];
                              form.setValue(
                                'grades',
                                GRADES.map((g) => g.slug).filter((g) => next.includes(g)),
                              );
                            }}
                            className={cn(
                              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[length:var(--fs-text-sm)]',
                              on ? 'border-accent bg-accent/10 text-fg' : 'border-line bg-surface-2 text-fg-muted hover:bg-surface-3',
                            )}
                          >
                            {on ? <Check aria-hidden="true" className="size-4 text-accent-text" /> : null}
                            {grade.labelAr}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              ) : null}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <SettingsField
                  name="adminEmail"
                  label={c.adminEmail}
                  description={c.adminEmailHint}
                  issues={issues}
                  render={(props) => (
                    <Input {...props} {...form.register('adminEmail')} type="email" dir="ltr" autoComplete="off" inputMode="email" />
                  )}
                />
                <SettingsField
                  name="adminName"
                  label={c.adminName}
                  issues={issues}
                  render={(props) => (
                    <Input
                      {...props}
                      {...form.register('adminName', { onChange: () => setTouched((t) => ({ ...t, adminName: true })) })}
                      autoComplete="off"
                    />
                  )}
                />
              </div>
              <SettingsField
                name="whatsapp"
                label={c.whatsapp}
                description={c.whatsappHint}
                issues={issues}
                render={(props) => (
                  <Input {...props} {...form.register('whatsapp')} dir="ltr" inputMode="tel" placeholder="+201000000000" autoComplete="off" />
                )}
              />
            </Section>

            <Section icon={Globe} title={c.sectionDomain} note={c.sectionDomainNote} hue="var(--ok)">
              <SettingsField
                name="appHost"
                label={c.appHost}
                description={c.appHostHint}
                issues={issues}
                render={(props) => (
                  <Input
                    {...props}
                    {...form.register('appHost', {
                      onChange: (event: { target: { value: string } }) => {
                        const host = cleanHost(event.target.value);
                        if (!touched.mediaHost) form.setValue('mediaHost', defaultMediaHost(host));
                        if (!touched.key) form.setValue('key', suggestTenantKey(host));
                      },
                    })}
                    dir="ltr"
                    inputMode="url"
                    placeholder="mohamedhassan.com"
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
              />
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <SettingsField
                  name="mediaHost"
                  label={c.mediaHost}
                  description={c.mediaHostHint}
                  issues={issues}
                  render={(props) => (
                    <Input
                      {...props}
                      {...form.register('mediaHost', { onChange: () => setTouched((t) => ({ ...t, mediaHost: true })) })}
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                />
                <SettingsField
                  name="key"
                  label={c.key}
                  description={c.keyHint}
                  issues={issues}
                  render={(props) => (
                    <Input
                      {...props}
                      {...form.register('key', { onChange: () => setTouched((t) => ({ ...t, key: true })) })}
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                      className="mono"
                    />
                  )}
                />
              </div>
            </Section>

            <Section icon={LayoutTemplate} title={c.sectionLook} note={c.sectionLookNote} hue="var(--a-9)">
              <LookPicker
                preset={values.landingPreset ?? 'board'}
                accent={(values.accent ?? 'blue') as AccentSlot}
                programming={values.subject === 'programming_cs'}
                error={form.formState.errors.landingPreset?.message}
                onPreset={(preset) => form.setValue('landingPreset', preset, { shouldValidate: true })}
                onAccent={(accent) => form.setValue('accent', accent)}
              />
            </Section>

            <Section icon={ToggleRight} title={c.sectionFeatures} note={c.sectionFeaturesNote} hue="var(--a-9)">
              <div className="divide-y divide-line-subtle">
                {features.map((feature) => {
                  // The whole `features` object, never `features.${key}` — two
                  // keys carry a dot, and a dot in a react-hook-form path is
                  // nesting (`platforms-form.tsx` has the incident).
                  const on = values.features?.[feature.key] === true;
                  return (
                    <label key={feature.key} className="flex items-center justify-between gap-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-fg">{feature.nameAr}</span>
                        <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">{feature.descriptionAr}</span>
                      </span>
                      <Checkbox
                        checked={on}
                        onCheckedChange={(checked) =>
                          form.setValue('features', { ...form.getValues('features'), [feature.key]: checked === true })
                        }
                        aria-label={feature.nameAr}
                      />
                    </label>
                  );
                })}
              </div>
            </Section>

            <Section icon={Sparkles} title={c.sectionExtras} hue="var(--a-11)">
              <label className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="block text-fg">{c.shareKeys}</span>
                  <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">{c.shareKeysHint}</span>
                </span>
                <Checkbox
                  checked={values.shareKeys === true}
                  onCheckedChange={(checked) => form.setValue('shareKeys', checked === true)}
                  aria-label={c.shareKeys}
                />
              </label>
              <details className="group rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-fg">{c.socialsTitle}</summary>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(['youtube', 'instagram', 'tiktok', 'facebook', 'whatsappChannel'] as const).map((field) => (
                    <SettingsField
                      key={field}
                      name={field}
                      label={c[field]}
                      issues={issues}
                      render={(props) => (
                        <Input {...props} {...form.register(field)} dir="ltr" inputMode="url" placeholder="https://" autoComplete="off" />
                      )}
                    />
                  ))}
                </div>
              </details>
            </Section>

            <div className="lg:hidden">
              <Summary values={values} cloudflare={cloudflare} />
            </div>

            <div>
              <Button type="submit" disabled={form.formState.isSubmitting} className="w-full gap-2 md:w-auto">
                <Rocket aria-hidden="true" className="size-4" />
                {form.formState.isSubmitting ? c.submitting : c.submit}
              </Button>
            </div>
          </form>

          <aside className="hidden lg:block">
            <div className="sticky top-4">
              <Summary values={values} cloudflare={cloudflare} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  note,
  hue,
  children,
}: {
  icon: LucideIcon;
  title: string;
  note?: string;
  /** The tile's colour — a token, so each section reads as its own object. */
  hue: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-lg"
            style={{ background: `color-mix(in oklch, ${hue}, transparent 85%)`, color: hue }}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{title}</h2>
            {note ? <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{note}</p> : null}
          </div>
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

function Summary({ values, cloudflare }: { values: Partial<ProvisionRequest>; cloudflare: boolean }) {
  const appHost = cleanHost(values.appHost ?? '');
  const mediaHost = cleanHost(values.mediaHost ?? '');
  const key = (values.key ?? '').trim();

  return (
    <Card className="border-[color-mix(in_oklch,var(--a-9),transparent_60%)]">
      <CardBody className="flex flex-col gap-3">
        <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.summaryTitle}</h2>
        {appHost === '' ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.summaryEmpty}</p>
        ) : (
          <dl className="flex flex-col gap-2 text-[length:var(--fs-text-sm)]">
            <Row label={c.summarySite} value={`https://${appHost}`} mono />
            <Row label={c.summaryMedia} value={mediaHost ? `https://${mediaHost}` : '—'} mono />
            <Row label={c.summaryKey} value={key || '—'} mono />
            <Row label={c.summaryDatabase} value={key ? databaseName(key) : '—'} mono />
            <Row label={c.summarySubject} value={subjectNameAr(values.subject ?? '')} />
            {values.grades && values.grades.length > 0 ? (
              <Row
                label={c.summaryGrades}
                value={GRADES.filter((g) => values.grades!.includes(g.slug)).map((g) => g.labelAr).join('، ')}
              />
            ) : null}
            <Row label={c.summaryDns} value={cloudflare ? c.summaryDnsAuto : c.summaryDnsManual} />
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2">
      <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
      <dd
        // Hostnames in the narrow side column: a smaller mono size keeps a
        // typical domain on one line instead of breaking mid-label.
        className={mono ? 'mono text-start text-[length:var(--fs-mono-label)] text-fg [overflow-wrap:anywhere]' : 'text-fg'}
        dir={mono ? 'ltr' : undefined}
        style={mono ? { unicodeBidi: 'isolate' } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

const PRESETS = [
  { id: 'board', label: copy.admin.settings.landingPresetBoard, hint: c.lookBoardHint },
  { id: 'classic', label: copy.admin.settings.landingPresetClassic, hint: c.lookClassicHint },
  { id: 'studio', label: copy.admin.settings.landingPresetStudio, hint: c.lookStudioHint },
  { id: 'ruqaa', label: copy.admin.settings.landingPresetRuqaa, hint: c.lookRuqaaHint },
  { id: 'kurrasa', label: copy.admin.settings.landingPresetKurrasa, hint: c.lookKurrasaHint },
  { id: 'taif', label: copy.admin.settings.landingPresetTaif, hint: c.lookTaifHint },
  { id: 'sabboora', label: copy.admin.settings.landingPresetSabboora, hint: c.lookSabbooraHint },
  { id: 'rihla', label: copy.admin.settings.landingPresetRihla, hint: c.lookRihlaHint },
  { id: 'nujoom', label: copy.admin.settings.landingPresetNujoom, hint: c.lookNujoomHint },
  { id: 'neon', label: copy.admin.settings.landingPresetNeon, hint: c.lookNeonHint },
] as const;

const ACCENT_NAMES: Record<AccentSlot, string> = {
  amber: copy.admin.branding.accentAmber,
  cyan: copy.admin.branding.accentCyan,
  blue: copy.admin.branding.accentBlue,
  violet: copy.admin.branding.accentViolet,
  magenta: copy.admin.branding.accentMagenta,
  slate: copy.admin.branding.accentSlate,
};

/**
 * The page's look: one of the landing presets and one accent. The same two
 * choices the teacher has later in `/admin/settings` — the run writes them
 * into the stack's env, and the stack seeds them into its own settings once.
 * `neon` is listed only for a programming subject (a non-programming stack
 * renders classic in its place).
 */
function LookPicker({
  preset,
  accent,
  programming,
  error,
  onPreset,
  onAccent,
}: {
  preset: string;
  accent: AccentSlot;
  programming: boolean;
  error?: string;
  onPreset: (preset: 'classic' | 'board' | 'studio' | 'neon' | 'ruqaa' | 'kurrasa' | 'taif' | 'sabboora' | 'rihla' | 'nujoom') => void;
  onAccent: (accent: AccentSlot) => void;
}) {
  const swatch = ACCENT_RAMPS[accent].light[0];
  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.lookPreset}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRESETS.filter((entry) => entry.id !== 'neon' || programming).map((entry) => {
            const on = preset === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPreset(entry.id)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-start transition-colors',
                  on ? 'border-accent bg-accent/10' : 'border-line bg-surface-2 hover:bg-surface-3',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-semibold text-fg">{entry.label}</span>
                  {on ? <Check aria-hidden="true" className="size-4 text-accent-text" /> : null}
                </span>
                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{entry.hint}</span>
              </button>
            );
          })}
        </div>
        {error ? <p className="mt-2 text-[length:var(--fs-text-sm)] text-err">{error}</p> : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.lookAccent}</legend>
        <div className="flex flex-wrap gap-2">
          {ACCENT_SLOTS.map((slot) => {
            const on = accent === slot;
            return (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={ACCENT_NAMES[slot]}
                onClick={() => onAccent(slot)}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-full border px-3 text-[length:var(--fs-text-sm)]',
                  on ? 'border-fg text-fg' : 'border-line text-fg-muted hover:bg-surface-3',
                )}
              >
                {/* The swatch IS the value being chosen: a literal from the
                    same ramp table the stack renders with, not a token. */}
                <span aria-hidden="true" className="size-4 rounded-full" style={{ background: ACCENT_RAMPS[slot].light[0] }} />
                {ACCENT_NAMES[slot]}
              </button>
            );
          })}
        </div>
        <div aria-hidden="true" className="mt-3 h-2 rounded-full" style={{ background: swatch }} />
      </fieldset>
    </div>
  );
}
