'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, CalendarClock, KeyRound, Power, PowerOff, Save, Settings2, UserPlus, Users, type LucideIcon } from 'lucide-react';
import type {
  CenterManager,
  ReservationCenterSetup,
  ReservationSettings,
} from '@ayman/contracts/center-reservations';
import { CENTER_MANAGER_PASSWORD_MIN } from '@ayman/contracts/center-reservations';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { formatCopy } from '@ayman/contracts/format';
import { egyptianPhoneForLabel } from '@ayman/contracts/phone';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { Chip, Ltr, ROW_BUTTON, ROW_BUTTON_TONE, TINT_WELL, TONE_TEXT, centerHue, tone } from '../../centers-ui';
import {
  createManagerAction,
  patchReservationCenterAction,
  saveReservationSettingsAction,
  setManagerDisabledAction,
  setManagerPasswordAction,
} from '../actions';

const a = reservationsCopy.admin;

function Section({
  icon: Icon,
  color,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section style={tone(color)} className="overflow-hidden rounded-xl border border-line bg-surface-2">
      <header className="flex items-start gap-3 bg-[color-mix(in_oklab,var(--ct-tone)_10%,var(--n-2))] p-4">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', TINT_WELL)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className={cn('text-[length:var(--fs-title-4)] font-semibold', TONE_TEXT)}>{title}</h2>
          {hint ? <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">{hint}</p> : null}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{hint}</p> : null}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-1 p-3">
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium text-fg">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/* ── The page ─────────────────────────────────────────────────────────────── */

export function PageSettingsForm({
  settings,
  grades,
}: {
  settings: ReservationSettings;
  grades: { slug: string; label: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<ReservationSettings>(settings);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ReservationSettings>(key: K, value: ReservationSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    const result = await saveReservationSettingsAction({
      ...form,
      headline: form.headline?.trim() || null,
      note: form.note?.trim() || null,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(a.saved);
      router.refresh();
    } else toast.error(result.message);
  }

  return (
    <Section icon={Settings2} color="var(--a-9)" title={a.pageSection}>
      <form
        method="post"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <SwitchRow id="rsv-open" label={a.isOpen} hint={a.isOpenHint} checked={form.isOpen} onChange={(v) => set('isOpen', v)} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field id="rsv-headline" label={a.headline}>
            <Input
              id="rsv-headline"
              value={form.headline ?? ''}
              maxLength={120}
              placeholder={a.headlinePlaceholder}
              onChange={(event) => set('headline', event.target.value)}
            />
          </Field>
          <Field id="rsv-note" label={a.note}>
            <Textarea
              id="rsv-note"
              rows={2}
              value={form.note ?? ''}
              maxLength={600}
              placeholder={a.notePlaceholder}
              onChange={(event) => set('note', event.target.value)}
            />
          </Field>
        </div>

        <Field id="rsv-pay-percent" label={a.payPercent} hint={a.payPercentHint}>
          <Input
            id="rsv-pay-percent"
            inputMode="numeric"
            dir="ltr"
            className="max-w-32"
            value={String(form.payPercent)}
            maxLength={3}
            onChange={(event) => {
              const digits = event.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '');
              set('payPercent', Math.min(100, Number(digits || '0')));
            }}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 font-medium text-fg">{a.grades}</legend>
          <div className="flex flex-wrap gap-2">
            {grades.map((grade) => {
              const on = form.grades.includes(grade.slug);
              return (
                <label
                  key={grade.slug}
                  style={tone('var(--viz-3)')}
                  className={cn(
                    'inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-[length:var(--fs-text-sm)] font-medium',
                    on
                      ? 'border-[color:var(--ct-tone)] bg-[color-mix(in_oklab,var(--ct-tone)_18%,var(--n-2))] text-fg'
                      : 'border-line bg-surface-1 text-fg-muted',
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[color:var(--a-9)]"
                    checked={on}
                    onChange={(event) =>
                      set(
                        'grades',
                        event.target.checked
                          ? grades.filter((g) => g.slug === grade.slug || form.grades.includes(g.slug)).map((g) => g.slug)
                          : form.grades.filter((slug) => slug !== grade.slug),
                      )
                    }
                  />
                  {grade.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium text-fg">{a.questions}</legend>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <SwitchRow id="rsv-ask-track" label={a.askTrack} checked={form.askTrack} onChange={(v) => set('askTrack', v)} />
            <SwitchRow id="rsv-ask-system" label={a.askSystem} checked={form.askSystem} onChange={(v) => set('askSystem', v)} />
            <SwitchRow id="rsv-ask-gender" label={a.askGender} checked={form.askGender} onChange={(v) => set('askGender', v)} />
          </div>
        </fieldset>

        <div>
          <Button type="submit" disabled={saving || form.grades.length === 0} className="gap-1.5">
            <Save className="size-4" aria-hidden="true" />
            {a.save}
          </Button>
        </div>
      </form>
    </Section>
  );
}

/* ── The centres ──────────────────────────────────────────────────────────── */

export function CentersSetup({
  centers,
  platform,
}: {
  centers: ReservationCenterSetup[];
  platform: { instapay: string | null; vodafoneCash: string | null };
}) {
  return (
    <Section icon={Building2} color="var(--viz-2)" title={a.centersSection} hint={a.centersHint}>
      {centers.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-fg-muted">{a.noCentersYet}</p>
          <a href="/admin/centers" style={tone('var(--viz-2)')} className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}>
            {a.goToCenters}
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {centers.map((center, index) => (
            <CenterRow key={center.id} center={center} color={centerHue(index)} platform={platform} />
          ))}
        </div>
      )}
    </Section>
  );
}

function fallbackHint(number: string | null): string {
  return number ? formatCopy(a.walletFallback, { number: egyptianPhoneForLabel(number) }) : a.walletFallbackNone;
}

function CenterRow({
  center,
  color,
  platform,
}: {
  center: ReservationCenterSetup;
  color: string;
  platform: { instapay: string | null; vodafoneCash: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(center.reservationsOpen);
  const [instapay, setInstapay] = useState(center.instapay ? egyptianPhoneForLabel(center.instapay) : '');
  const [vodafone, setVodafone] = useState(center.vodafoneCash ? egyptianPhoneForLabel(center.vodafoneCash) : '');
  const [saving, setSaving] = useState(false);

  async function save(nextOpen = open) {
    setSaving(true);
    const result = await patchReservationCenterAction(center.id, {
      reservationsOpen: nextOpen,
      instapay: instapay.trim() || null,
      vodafoneCash: vodafone.trim() || null,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(a.saved);
      router.refresh();
    } else {
      toast.error(result.message);
      setOpen(center.reservationsOpen);
    }
  }

  return (
    <form
      method="post"
      style={tone(color)}
      className="flex flex-col gap-3 rounded-lg border border-s-4 border-line border-s-[color:var(--ct-tone)] bg-surface-1 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('grid size-9 place-items-center rounded-lg', TINT_WELL)}>
          <Building2 className="size-4" aria-hidden="true" />
        </span>
        <span className={cn('min-w-0 flex-1 font-semibold', TONE_TEXT)}>{center.name}</span>
        {!center.isActive ? <Chip color="var(--err)">{a.centerInactive}</Chip> : null}
        <label htmlFor={`open-${center.id}`} className="text-[length:var(--fs-text-sm)] text-fg">
          {a.centerOpen}
        </label>
        <Switch
          id={`open-${center.id}`}
          checked={open}
          disabled={saving}
          onCheckedChange={(value) => {
            setOpen(value);
            void save(value);
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex min-w-0 flex-col justify-center gap-1.5 rounded-lg border border-line bg-surface-2 p-3">
          {center.slots > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">
              <CalendarClock className="size-4 text-[color:var(--ct-tone)]" aria-hidden="true" />
              {formatCopy(a.groupsCount, { n: center.slots, priced: center.pricedSlots })}
            </span>
          ) : (
            <span className="text-[length:var(--fs-text-sm)] font-medium text-[color:var(--warn)]">{a.noGroupsWarn}</span>
          )}
          <a href="/admin/centers" className="text-[length:var(--fs-text-xs)] text-accent-text underline underline-offset-2">
            {a.manageGroups}
          </a>
        </div>
        <Field id={`instapay-${center.id}`} label={a.instapayLabel} hint={fallbackHint(platform.instapay)}>
          <Input
            id={`instapay-${center.id}`}
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="01xxxxxxxxx"
            value={instapay}
            onChange={(event) => setInstapay(event.target.value)}
          />
        </Field>
        <Field id={`vodafone-${center.id}`} label={a.vodafoneLabel} hint={fallbackHint(platform.vodafoneCash)}>
          <Input
            id={`vodafone-${center.id}`}
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="01xxxxxxxxx"
            value={vodafone}
            onChange={(event) => setVodafone(event.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={saving} className="gap-1.5">
          <Save className="size-4" aria-hidden="true" />
          {a.save}
        </Button>
      </div>
    </form>
  );
}

/* ── The centre owners' logins ───────────────────────────────────────────── */

export function ManagersSetup({
  managers,
  centers,
  loginUrl,
}: {
  managers: CenterManager[];
  centers: { id: string; name: string }[];
  loginUrl: string;
}) {
  const router = useRouter();
  const [centerId, setCenterId] = useState(centers[0]?.id ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!centerId || name.trim().length < 2 || !phone.trim() || password.length < CENTER_MANAGER_PASSWORD_MIN) {
      toast.error(a.actionFailed);
      return;
    }
    setSaving(true);
    const result = await createManagerAction({ centerId, name: name.trim(), phone: phone.trim(), password });
    setSaving(false);
    if (result.ok) {
      toast.success(a.saved);
      setName('');
      setPhone('');
      setPassword('');
      router.refresh();
    } else toast.error(result.message);
  }

  return (
    <Section icon={Users} color="var(--viz-3)" title={a.managersSection} hint={a.managersHint}>
      <p className="mb-3 inline-flex max-w-full items-center gap-2 rounded-md bg-surface-1 px-3 py-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
        {a.loginAt}:
        <Ltr className="truncate font-semibold text-fg">{loginUrl}</Ltr>
      </p>

      {managers.length === 0 ? (
        <p className="mb-4 text-fg-muted">{a.noManagers}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {managers.map((manager) => (
            <ManagerRow key={manager.id} manager={manager} />
          ))}
        </ul>
      )}

      {centers.length > 0 ? (
        <form
          method="post"
          className="flex flex-col gap-3 rounded-lg border border-dashed border-line bg-surface-1 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <p className="inline-flex items-center gap-1.5 font-semibold text-fg">
            <UserPlus className="size-4" aria-hidden="true" />
            {a.addManager}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field id="mgr-center" label={a.managerCenter}>
              <Select id="mgr-center" value={centerId} onChange={(event) => setCenterId(event.target.value)}>
                {centers.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="mgr-name" label={a.managerName}>
              <Input id="mgr-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field id="mgr-phone" label={a.managerPhone}>
              <Input
                id="mgr-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                placeholder="01xxxxxxxxx"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <Field id="mgr-password" label={a.managerPassword}>
              <Input
                id="mgr-password"
                dir="ltr"
                autoComplete="new-password"
                value={password}
                minLength={CENTER_MANAGER_PASSWORD_MIN}
                maxLength={128}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          </div>
          <div>
            <Button type="submit" disabled={saving} className="gap-1.5">
              <UserPlus className="size-4" aria-hidden="true" />
              {a.create}
            </Button>
          </div>
        </form>
      ) : null}
    </Section>
  );
}

function ManagerRow({ manager }: { manager: CenterManager }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function changePassword() {
    if (password.length < CENTER_MANAGER_PASSWORD_MIN) {
      toast.error(a.actionFailed);
      return;
    }
    setBusy(true);
    const result = await setManagerPasswordAction(manager.id, password);
    setBusy(false);
    if (result.ok) {
      toast.success(a.passwordSaved);
      setPassword('');
    } else toast.error(result.message);
  }

  async function toggle() {
    setBusy(true);
    const result = await setManagerDisabledAction(manager.id, !manager.disabled);
    setBusy(false);
    if (result.ok) router.refresh();
    else toast.error(result.message);
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-fg">{manager.name}</span>
          <Chip color="var(--viz-2)" icon={Building2}>
            {manager.centerName}
          </Chip>
          {manager.disabled ? <Chip color="var(--err)">{a.disabled}</Chip> : null}
        </div>
        {manager.phone ? (
          <Ltr className="text-[length:var(--fs-text-sm)] text-fg-muted">{egyptianPhoneForLabel(manager.phone)}</Ltr>
        ) : null}
      </div>
      <form
        method="post"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void changePassword();
        }}
      >
        <label htmlFor={`pw-${manager.id}`} className="sr-only">
          {a.newPassword}
        </label>
        <Input
          id={`pw-${manager.id}`}
          dir="ltr"
          autoComplete="new-password"
          placeholder={a.newPassword}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-44"
        />
        <button type="submit" disabled={busy} style={tone('var(--info)')} className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}>
          <KeyRound className="size-4" aria-hidden="true" />
          {a.setPassword}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggle()}
          style={tone(manager.disabled ? 'var(--ok)' : 'var(--err)')}
          className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}
        >
          {manager.disabled ? <Power className="size-4" aria-hidden="true" /> : <PowerOff className="size-4" aria-hidden="true" />}
          {manager.disabled ? a.enable : a.disable}
        </button>
      </form>
    </li>
  );
}
