'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeftRight } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Select } from '@ayman/ui/components/select';
import { setStudentBookingAction } from '../../centers/actions';

const c = copy.admin.centers.student;

export interface BookingSlotOption {
  id: string;
  centerName: string;
  /** «مجموعة ١ — السبت · 2:00 م – 4:00 م», formatted on the server. */
  text: string;
  active: boolean;
  full: boolean;
}

/**
 * «نقل الحجز» — book, move or remove this student's centre slot by hand.
 *
 * Every slot is offered, «فل» and switched-off ones included and marked: the
 * API lets the admin past both on purpose (a seat promised on the phone is a
 * seat), and hiding them would make that override unreachable. The empty
 * choice removes the booking, which the API pairs with «أونلاين».
 */
export function CenterBookingControl({
  userId,
  currentSlotId,
  slots,
}: {
  userId: string;
  currentSlotId: string | null;
  slots: readonly BookingSlotOption[];
}) {
  const router = useRouter();
  const selectId = useId();
  const [value, setValue] = useState(currentSlotId ?? '');
  const [saving, setSaving] = useState(false);

  const groups = new Map<string, BookingSlotOption[]>();
  for (const slot of slots) {
    const list = groups.get(slot.centerName) ?? [];
    list.push(slot);
    groups.set(slot.centerName, list);
  }

  async function save() {
    setSaving(true);
    const result = await setStudentBookingAction(userId, value === '' ? null : value);
    setSaving(false);
    if (result.ok) {
      toast.success(c.bookingSaved);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-[length:var(--fs-text-sm)] font-medium text-fg">
        {c.moveLabel}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          id={selectId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-w-0 flex-1"
        >
          <option value="">{c.noSlot}</option>
          {[...groups].map(([centerName, options]) => (
            <optgroup key={centerName} label={centerName}>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {!option.active
                    ? formatCopy(c.inactiveSlot, { slot: option.text })
                    : option.full
                      ? formatCopy(c.fullSlot, { slot: option.text })
                      : option.text}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || value === (currentSlotId ?? '')}
          className="gap-1.5"
        >
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          {saving ? c.savingBooking : c.saveBooking}
        </Button>
      </div>
    </div>
  );
}
