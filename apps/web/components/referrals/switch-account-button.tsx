'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import { referralsCopy as c } from '@ayman/contracts/copy/referrals';
import { Button } from '@ayman/ui/components/button';
import { signOut } from '@/lib/auth-client';

/**
 * «خروج وعمل حساب جديد» on `/invited`. `SignOutButton` always lands on `/`;
 * this one has to land on `/register`, where the referral cookie set by
 * `/r/<code>` is still waiting. A full document load for the same reason
 * `SignOutButton` gives: the client router cache still holds the signed-in
 * render, and the proxy decides `/register` per request.
 */
export function SwitchAccountButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      await signOut();
    } catch {
      toast.error(copy.nav.logoutFailed);
      setPending(false);
      return;
    }
    window.location.assign('/register');
  }

  return (
    <Button type="button" className="mb-4 w-full" disabled={pending} onClick={() => void handleClick()}>
      {pending ? c.signedInSwitching : c.signedInSwitch}
    </Button>
  );
}
