'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { ReferralProgram } from '@ayman/contracts/admin/referrals';
import { adminReferralsCopy as c } from '@ayman/contracts/copy/admin-referrals';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Switch } from '@ayman/ui/components/switch';
import { saveReferralProgramAction } from './actions';

/**
 * «إعدادات البرنامج». Amounts are typed in POUNDS and sent in piastres — the
 * admin thinks in «٥٠ جنيه», and a field in piastres is how 50 becomes 0.50.
 * Bounds are the contract's (`ReferralProgramSchema`); the API refuses
 * anything outside them with a 400 the form names.
 */
export function ReferralProgramForm({ initial }: { initial: ReferralProgram }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [whatsappNotice, setWhatsappNotice] = useState(initial.whatsappNotice);
  const [referrer, setReferrer] = useState(String(initial.referrerRewardCents / 100));
  const [friend, setFriend] = useState(String(initial.friendRewardCents / 100));
  const [cap, setCap] = useState(String(initial.monthlyCap));
  const [windowDays, setWindowDays] = useState(String(initial.windowDays));

  const pounds = (value: string) => Math.round(Number(value) * 100);

  function save() {
    startTransition(async () => {
      const result = await saveReferralProgramAction({
        enabled,
        whatsappNotice,
        referrerRewardCents: pounds(referrer),
        friendRewardCents: pounds(friend),
        monthlyCap: Math.round(Number(cap)),
        windowDays: Math.round(Number(windowDays)),
      });
      if (result.ok) {
        toast.success(c.saved);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  const numberField = (id: string, label: string, value: string, set: (next: string) => void, max: number) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        dir="ltr"
        value={value}
        onChange={(event) => set(event.target.value)}
      />
    </div>
  );

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex items-start gap-3 rounded-md border border-line-subtle bg-surface-1 p-3">
        <Switch id="rf-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <div>
          <Label htmlFor="rf-enabled">{c.enabled}</Label>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.enabledHint}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {numberField('rf-referrer', c.referrerReward, referrer, setReferrer, 1000)}
        {numberField('rf-friend', c.friendReward, friend, setFriend, 1000)}
        {numberField('rf-cap', c.monthlyCap, cap, setCap, 1000)}
        {numberField('rf-window', c.windowDays, windowDays, setWindowDays, 90)}
      </div>

      <div className="flex items-start gap-3 rounded-md border border-line-subtle bg-surface-1 p-3">
        <Switch id="rf-notice" checked={whatsappNotice} onCheckedChange={setWhatsappNotice} />
        <div>
          <Label htmlFor="rf-notice">{c.whatsappNotice}</Label>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.whatsappHint}</p>
        </div>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? c.saving : c.save}
        </Button>
      </div>
    </form>
  );
}
