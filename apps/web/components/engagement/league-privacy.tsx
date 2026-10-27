'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff } from 'lucide-react';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { apiPut } from '@/lib/api';

const c = engagementCopy.league.privacy;

/** The one switch on «دوري الأسبوع»: take the name and photo off everyone else's table. */
export function LeaguePrivacy({ hidden }: { hidden: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(hidden);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  async function toggle(next: boolean): Promise<void> {
    setOn(next);
    setError(false);
    try {
      await apiPut('/api/me/league/settings', { hidden: next });
      startTransition(() => router.refresh());
    } catch {
      setOn(!next);
      setError(true);
    }
  }

  return (
    <section className="eg-card eg-privacy">
      <label className="eg-privacy__row">
        <span className="eg-panel__icon" aria-hidden="true">
          <EyeOff className="size-5" />
        </span>
        <span className="eg-privacy__text">
          <span className="eg-field__label">{c.label}</span>
          <span className="eg-field__hint">{c.hint}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="eg-switch"
          checked={on}
          disabled={pending}
          onChange={(event) => void toggle(event.target.checked)}
        />
      </label>
      {error ? (
        <p className="eg-error" role="alert">
          {c.failed}
        </p>
      ) : null}
    </section>
  );
}
