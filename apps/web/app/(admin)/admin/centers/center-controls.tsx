'use client';

import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Plus, Power, PowerOff, Trash2, type LucideIcon } from 'lucide-react';
import type { AdminCenter, AdminSlot } from '@ayman/contracts/admin/centers';
import { DAY_NAMES_AR, formatSlotTime } from '@ayman/contracts/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import {
  createCenterAction,
  createSlotAction,
  deleteCenterAction,
  deleteSlotAction,
  updateCenterAction,
  updateSlotAction,
  type ActionResult,
} from './actions';
import { ROW_BUTTON, ROW_BUTTON_TONE, TINT_CARD, tone } from './centers-ui';

const c = copy.admin.centers;

/* ── time ⇄ minutes ─────────────────────────────────────────────────────── */

/** `840` → `"14:00"` — what `<input type="time">` holds, always 24-hour
 *  whatever the phone displays. */
function toTimeValue(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  return `${String(hours).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
function fromTimeValue(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute <= 1440 ? minute : null;
}

/* ── shared pieces ──────────────────────────────────────────────────────── */

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
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
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-line bg-surface-1 p-3">
      <span className="min-w-0">
        <label htmlFor={id} className="block text-[length:var(--fs-text-sm)] font-medium text-fg">
          {label}
        </label>
        <span className="mt-0.5 block text-[length:var(--fs-text-xs)] text-fg-muted">{hint}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
      {message}
    </p>
  );
}

/** A coloured, iconed row button that opens a dialog. */
function RowTrigger({
  color,
  icon: Icon,
  children,
  ...props
}: {
  color: string;
  icon: LucideIcon;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      style={tone(color)}
      className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'disabled:opacity-60')}
      {...props}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

/* ── the centre form ────────────────────────────────────────────────────── */

/**
 * «سنتر جديد» and «تعديل» — one form, because the two differ only in which
 * action runs and what the fields start at.
 */
export function CenterDialog({ center }: { center?: AdminCenter }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {center ? (
          <RowTrigger color="var(--info)" icon={Pencil}>
            {c.edit}
          </RowTrigger>
        ) : (
          <Button type="button" className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            {c.newCenter}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.cancel} className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{center ? c.centerForm.editTitle : c.centerForm.createTitle}</DialogTitle>
        </DialogHeader>
        {/* `key` on the open state so a second «سنتر جديد» starts empty rather
            than holding whatever the last one was left with. */}
        <CenterForm
          key={String(open)}
          center={center}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CenterForm({ center, onDone }: { center?: AdminCenter; onDone: () => void }) {
  const f = c.centerForm;
  const [name, setName] = useState(center?.name ?? '');
  const [address, setAddress] = useState(center?.address ?? '');
  const [phone, setPhone] = useState(center?.phone ?? '');
  const [mapUrl, setMapUrl] = useState(center?.mapUrl ?? '');
  const [isActive, setIsActive] = useState(center?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (name.trim().length < 2) return setError(f.badName);
    const map = mapUrl.trim();
    if (map !== '' && !/^https?:\/\/\S+$/i.test(map)) return setError(f.badMap);
    setError(null);
    setSaving(true);
    const body = {
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      mapUrl: map || null,
      isActive,
    };
    const result = center
      ? await updateCenterAction(center.id, body)
      : await createCenterAction(body);
    setSaving(false);
    if (result.ok) {
      toast.success(c.toasts.saved);
      onDone();
    } else {
      setError(result.message);
    }
  }

  return (
    <form
      method="post"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field id="center-name" label={f.name} required>
        <Input
          id="center-name"
          value={name}
          maxLength={120}
          placeholder={f.namePlaceholder}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>
      <Field id="center-address" label={f.address}>
        <Input
          id="center-address"
          value={address}
          maxLength={300}
          placeholder={f.addressPlaceholder}
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="center-phone" label={f.phone}>
          <Input
            id="center-phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            value={phone}
            maxLength={40}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        <Field id="center-map" label={f.mapUrl} hint={f.mapUrlHint}>
          <Input
            id="center-map"
            type="url"
            dir="ltr"
            value={mapUrl}
            maxLength={500}
            placeholder="https://maps.app.goo.gl/…"
            onChange={(event) => setMapUrl(event.target.value)}
          />
        </Field>
      </div>
      <SwitchRow
        id="center-active"
        label={f.isActive}
        hint={f.isActiveHint}
        checked={isActive}
        onChange={setIsActive}
      />
      <FormError message={error} />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary" disabled={saving}>
            {f.cancel}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving || name.trim().length < 2}>
          {saving ? f.saving : f.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ── the slot form ──────────────────────────────────────────────────────── */

export function SlotDialog({
  centerId,
  centerName,
  slot,
  prominent = false,
}: {
  centerId: string;
  centerName: string;
  slot?: AdminSlot;
  /** The «ميعاد جديد» under an empty centre — the one next step on it, so it
   *  reads as a button, not a row control. */
  prominent?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {slot ? (
          <RowTrigger color="var(--info)" icon={Pencil}>
            {c.edit}
          </RowTrigger>
        ) : prominent ? (
          <Button type="button" size="sm" className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            {c.newSlot}
          </Button>
        ) : (
          <RowTrigger color="var(--ok)" icon={Plus}>
            {c.newSlot}
          </RowTrigger>
        )}
      </DialogTrigger>
      {/* Wider than the default 420px: three fields to a row from `sm`,
          and a time input squeezed into a third of 420 clips its own «م». */}
      <DialogContent closeLabel={copy.admin.common.cancel} className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {slot ? c.slotForm.editTitle : formatCopy(c.slotForm.createTitle, { center: centerName })}
          </DialogTitle>
        </DialogHeader>
        <SlotForm
          key={String(open)}
          centerId={centerId}
          slot={slot}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SlotForm({
  centerId,
  slot,
  onDone,
}: {
  centerId: string;
  slot?: AdminSlot;
  onDone: () => void;
}) {
  const f = c.slotForm;
  const [dayOfWeek, setDayOfWeek] = useState(String(slot?.dayOfWeek ?? 6));
  const [start, setStart] = useState(toTimeValue(slot?.startMinute ?? 16 * 60));
  const [end, setEnd] = useState(toTimeValue(slot?.endMinute ?? 18 * 60));
  const [year, setYear] = useState(slot && slot.year !== null ? String(slot.year) : '');
  const [capacity, setCapacity] = useState(slot?.capacity ? String(slot.capacity) : '');
  const [price, setPrice] = useState(
    slot && slot.priceCents !== null ? String(slot.priceCents / 100) : '',
  );
  const [label, setLabel] = useState(slot?.label ?? '');
  const [isFull, setIsFull] = useState(slot?.isFull ?? false);
  const [isActive, setIsActive] = useState(slot?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const startMinute = fromTimeValue(start);
    const endMinute = fromTimeValue(end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      return setError(f.badTimes);
    }
    let capacityValue: number | null = null;
    if (capacity.trim() !== '') {
      const parsed = Number(capacity);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) return setError(f.badCapacity);
      capacityValue = parsed;
    }
    let priceCents: number | null = null;
    if (price.trim() !== '') {
      const parsed = Number(price);
      if (!Number.isFinite(parsed) || parsed < 0) return setError(f.badPrice);
      // Pounds as typed → piastres. Rounded, so «١٥٠٫٥» is 15050 and not
      // 15049.999… that the API's `.int()` would refuse.
      priceCents = Math.round(parsed * 100);
    }

    setError(null);
    setSaving(true);
    const body = {
      label: label.trim() || null,
      dayOfWeek: Number(dayOfWeek),
      startMinute,
      endMinute,
      year: year === '' ? null : Number(year),
      capacity: capacityValue,
      priceCents,
      isFull,
      isActive,
    };
    const result = slot
      ? await updateSlotAction(slot.id, body)
      : await createSlotAction(centerId, body);
    setSaving(false);
    if (result.ok) {
      toast.success(c.toasts.saved);
      onDone();
    } else {
      setError(result.message);
    }
  }

  return (
    <form
      method="post"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id="slot-day" label={f.day} required>
          <Select id="slot-day" value={dayOfWeek} onChange={(event) => setDayOfWeek(event.target.value)}>
            {DAY_NAMES_AR.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="slot-start" label={f.start} required>
          <Input
            id="slot-start"
            type="time"
            dir="ltr"
            step={300}
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
          />
        </Field>
        <Field id="slot-end" label={f.end} required>
          <Input
            id="slot-end"
            type="time"
            dir="ltr"
            step={300}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id="slot-year" label={f.year}>
          <Select id="slot-year" value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="">{c.allYears}</option>
            {c.yearNames.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="slot-capacity" label={f.capacity} hint={f.capacityHint}>
          <Input
            id="slot-capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={5000}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </Field>
        <Field id="slot-price" label={f.price} hint={f.priceHint}>
          <Input
            id="slot-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>
      </div>

      <Field id="slot-label" label={f.label}>
        <Input
          id="slot-label"
          value={label}
          maxLength={80}
          placeholder={f.labelPlaceholder}
          onChange={(event) => setLabel(event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SwitchRow id="slot-full" label={f.isFull} hint={f.isFullHint} checked={isFull} onChange={setIsFull} />
        <SwitchRow
          id="slot-active"
          label={f.isActive}
          hint={f.isActiveHint}
          checked={isActive}
          onChange={setIsActive}
        />
      </div>

      <FormError message={error} />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary" disabled={saving}>
            {f.cancel}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={saving}>
          {saving ? f.saving : f.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ── row controls ───────────────────────────────────────────────────────── */

/** «تعديل» / «إيقاف» or «تشغيل» / «حذف» on one centre. */
export function CenterActions({ center }: { center: AdminCenter }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setActive(isActive: boolean): Promise<ActionResult> {
    setPending(true);
    const result = await updateCenterAction(center.id, { isActive });
    setPending(false);
    if (result.ok) {
      toast.success(isActive ? c.toasts.activated : c.toasts.deactivated);
      router.refresh();
    } else {
      toast.error(result.message);
    }
    return result;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CenterDialog center={center} />
      <RowTrigger
        color={center.isActive ? 'var(--warn)' : 'var(--ok)'}
        icon={center.isActive ? PowerOff : Power}
        disabled={pending}
        onClick={() => void setActive(!center.isActive)}
      >
        {center.isActive ? c.deactivate : c.activate}
      </RowTrigger>
      <DeleteDialog
        title={formatCopy(c.confirm.deleteCenterTitle, { name: center.name })}
        body={c.confirm.deleteCenterBody}
        run={() => deleteCenterAction(center.id)}
        deactivate={center.isActive ? () => setActive(false) : undefined}
      />
    </div>
  );
}

/** The «فل» and «شغال» switches on one slot — each a write of its own, so the
 *  door and the booking form follow the moment it flips. */
export function SlotSwitches({ slot }: { slot: AdminSlot }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function patch(field: 'isFull' | 'isActive', value: boolean) {
    setPending(true);
    const result = await updateSlotAction(
      slot.id,
      field === 'isFull' ? { isFull: value } : { isActive: value },
    );
    setPending(false);
    if (result.ok) {
      toast.success(
        field === 'isFull'
          ? value
            ? c.toasts.markedFull
            : c.toasts.markedOpen
          : value
            ? c.toasts.activated
            : c.toasts.deactivated,
      );
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Tinted while on: «فل» is the state someone at a glance needs to see —
          a full slot turns students away at the booking form. */}
      <label
        style={tone('var(--warn)')}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-[length:var(--fs-text-sm)] font-medium text-fg md:h-9',
          slot.isFull ? TINT_CARD : 'border border-line bg-surface-1',
        )}
      >
        <Switch
          checked={slot.isFull}
          disabled={pending}
          aria-label={c.fullSwitch}
          onCheckedChange={(next) => void patch('isFull', next)}
        />
        {c.fullSwitch}
      </label>
      <label className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface-1 px-2.5 text-[length:var(--fs-text-sm)] font-medium text-fg md:h-9">
        <Switch
          checked={slot.isActive}
          disabled={pending}
          aria-label={c.activeSwitch}
          onCheckedChange={(next) => void patch('isActive', next)}
        />
        {c.activeSwitch}
      </label>
    </div>
  );
}

/** «تعديل» / «حذف» on one slot. */
export function SlotActions({
  slot,
  centerId,
  centerName,
}: {
  slot: AdminSlot;
  centerId: string;
  centerName: string;
}) {
  const router = useRouter();

  async function deactivate(): Promise<ActionResult> {
    const result = await updateSlotAction(slot.id, { isActive: false });
    if (result.ok) {
      toast.success(c.toasts.deactivated);
      router.refresh();
    } else {
      toast.error(result.message);
    }
    return result;
  }

  return (
    <>
      <SlotDialog centerId={centerId} centerName={centerName} slot={slot} />
      <DeleteDialog
        title={c.confirm.deleteSlotTitle}
        body={formatCopy(c.confirm.deleteSlotBody, {
          slot: slot.label ? `${slot.label} — ${formatSlotTime(slot)}` : formatSlotTime(slot),
        })}
        run={() => deleteSlotAction(slot.id)}
        deactivate={slot.isActive ? deactivate : undefined}
      />
    </>
  );
}

/**
 * «حذف» behind a confirm. A centre or slot with bookings or attendance behind
 * it cannot be deleted — the API answers 409 — and the dialog then stays open
 * and swaps its button for «إيقاف بدل الحذف», which is what the admin almost
 * always wanted: out of the students' way, with the record kept.
 */
function DeleteDialog({
  title,
  body,
  run,
  deactivate,
}: {
  title: string;
  body: string;
  run: () => Promise<ActionResult>;
  /** Absent when it is already off — there is nothing to offer instead. */
  deactivate?: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);

  async function go() {
    setPending(true);
    const result = await run();
    setPending(false);
    if (result.ok) {
      setOpen(false);
      toast.success(c.toasts.deleted);
      router.refresh();
    } else if (result.hasHistory) {
      setBlocked(true);
    } else {
      toast.error(result.message);
    }
  }

  async function stop() {
    if (!deactivate) return;
    setPending(true);
    const result = await deactivate();
    setPending(false);
    if (result.ok) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setBlocked(false);
      }}
    >
      <DialogTrigger asChild>
        <RowTrigger color="var(--err)" icon={Trash2}>
          {c.delete}
        </RowTrigger>
      </DialogTrigger>
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{blocked ? c.confirm.hasHistory : body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              {c.confirm.back}
            </Button>
          </DialogClose>
          {blocked ? (
            deactivate ? (
              <Button onClick={() => void stop()} disabled={pending} className="gap-1.5">
                <PowerOff className="size-4" aria-hidden="true" />
                {c.confirm.deactivateInstead}
              </Button>
            ) : null
          ) : (
            <Button variant="danger" onClick={() => void go()} disabled={pending}>
              {c.confirm.confirmDelete}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
