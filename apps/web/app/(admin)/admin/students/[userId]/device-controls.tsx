'use client';

import { useActionState, useState } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { DEFAULT_MAX_DEVICES, DEVICE_LIMIT_CEILING, DEVICE_LIMIT_FLOOR } from '@ayman/contracts/device-limit';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import {
  revokeAllStudentDevicesAction,
  revokeStudentDeviceAction,
  setStudentDeviceLimitAction,
  type ActionResult,
} from '../actions';
import { devicesLabel } from './device-count';

const IDLE: ActionResult = { ok: true };
const c = copy.admin.settings;

/**
 * «سجّل خروج» — one press to ask, a second to do it.
 *
 * An inline confirm rather than a dialog: it is reversible (the student signs
 * straight back in), so it earns one extra press and no modal. The question
 * names the device, because the card can list two rows that differ only by
 * browser and the operator should read which one before it goes.
 *
 * The confirm closes from INSIDE the action, for the reason `BanDialog`
 * records: an effect on `state` fires on mount, `IDLE` being `{ ok: true }`.
 * On success the page revalidates and this row is gone anyway.
 */
function SignOutConfirm({
  label,
  question,
  run,
}: {
  label: string;
  question: string;
  run: () => Promise<ActionResult>;
}) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(async () => {
    const result = await run();
    if (result.ok) setAsking(false);
    return result;
  }, IDLE);

  if (!asking) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button type="button" variant="danger" size="sm" className="whitespace-nowrap" onClick={() => setAsking(true)}>
          {label}
        </Button>
        {!state.ok ? (
          <p role="alert" className="text-[length:var(--fs-text-xs)] text-err">
            {state.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? copy.admin.actions.saving : c.studentDevicesSignOutYes}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setAsking(false)}>
          {copy.admin.actions.cancel}
        </Button>
      </div>
      {!state.ok ? (
        <p role="alert" className="text-[length:var(--fs-text-xs)] text-err">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function DeviceSignOut({
  userId,
  deviceId,
  deviceName,
}: {
  userId: string;
  deviceId: string;
  deviceName: string;
}) {
  return (
    <SignOutConfirm
      label={c.studentDevicesSignOut}
      question={formatCopy(c.studentDevicesSignOutAsk, { device: deviceName })}
      run={() => revokeStudentDeviceAction(userId, deviceId)}
    />
  );
}

export function SignOutAllDevices({ userId }: { userId: string }) {
  return (
    <SignOutConfirm
      label={c.studentDevicesSignOutAll}
      question={c.studentDevicesSignOutAllAsk}
      run={() => revokeAllStudentDevicesAction(userId)}
    />
  );
}

/** Every value the column accepts, one to ten — «براحتي», in his words. */
const LIMIT_CHOICES = Array.from(
  { length: DEVICE_LIMIT_CEILING - DEVICE_LIMIT_FLOOR + 1 },
  (_, index) => DEVICE_LIMIT_FLOOR + index,
);

/**
 * «مسموح له بكام جهاز» for this one account.
 *
 * `''` is «الافتراضي» and is a different answer from «٢» even though both
 * count to two today: NULL follows the platform default if it ever moves, a
 * stored 2 does not. The action turns `''` into `null`.
 *
 * Uncontrolled and NOT keyed on the stored value: after a save the select
 * already shows what was stored, and a remount on the new key would throw
 * away the «اتحفظ.» under it. The sentence above the card is what re-reads the
 * database — «مسموح له بـ٣ أجهزة» changing is the confirmation that counts.
 */
export function DeviceLimitControl({ userId, maxDevices }: { userId: string; maxDevices: number | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => setStudentDeviceLimitAction(userId, formData),
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="max-devices">{c.studentDevicesLimitLabel}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          id="max-devices"
          name="maxDevices"
          defaultValue={maxDevices === null ? '' : String(maxDevices)}
          className="w-auto min-w-[10rem]"
        >
          <option value="">
            {formatCopy(c.studentDevicesLimitDefault, { devices: devicesLabel(DEFAULT_MAX_DEVICES) })}
          </option>
          {LIMIT_CHOICES.map((count) => (
            <option key={count} value={String(count)}>
              {devicesLabel(count)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? copy.admin.actions.saving : c.studentDevicesLimitSave}
        </Button>
      </div>
      {state === null ? null : state.ok ? (
        <p role="status" className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {c.studentDevicesLimitSaved}
        </p>
      ) : (
        <p role="alert" className="text-[length:var(--fs-text-xs)] text-err">
          {state.message}
        </p>
      )}
    </form>
  );
}
