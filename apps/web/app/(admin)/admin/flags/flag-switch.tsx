'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { FeatureFlag } from '@ayman/contracts/admin/flags';
import { copy } from '@ayman/contracts';
import { Switch } from '@ayman/ui';
import { setFlag } from './actions';

/**
 * Optimistic toggle: the switch flips immediately, then reconciles with the
 * server's response (or reverts on failure) — a flag toggle that waits for a
 * round trip before moving reads as broken on a slow connection.
 */
export function FlagSwitch({ flag }: { flag: FeatureFlag }) {
  const [enabled, setEnabledState] = useState(flag.enabled);
  const [pending, setPending] = useState(false);

  async function toggle(next: boolean) {
    setEnabledState(next);
    setPending(true);
    try {
      const updated = await setFlag(flag.key, next);
      setEnabledState(updated.enabled);
      toast.success(copy.admin.flags.toggleSuccess);
    } catch {
      setEnabledState(!next); // revert
      toast.error(copy.admin.flags.toggleFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {flag.key}
        </span>
        <span className="block text-fg">{flag.descriptionAr}</span>
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => void toggle(checked)}
        disabled={pending}
        aria-label={flag.descriptionAr}
      />
    </label>
  );
}
