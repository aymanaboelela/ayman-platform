'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { AdminPracticeSetRow } from '@ayman/contracts/practice';
import { Switch } from '@ayman/ui/components/switch';
import { patchPracticeSet } from '@/app/(admin)/admin/practice/actions';

/**
 * «منشور على الموقع» — one switch, saved the moment it flips.
 *
 * Optimistic, and reverted on a refused write: a switch left in the position
 * the server did not accept is a set the instructor believes is live (or
 * hidden) when it is not. It follows the prop again whenever the page re-reads
 * the set, so two tabs cannot disagree for longer than one refresh.
 */
export function PublishSwitch({ set }: { set: Pick<AdminPracticeSetRow, 'id' | 'published' | 'questionCount'> }) {
  const router = useRouter();
  const id = useId();
  const [on, setOn] = useState(set.published);
  const [busy, setBusy] = useState(false);

  // Re-sync when a refresh brings a different value — during render, the
  // pattern React documents for state derived from a prop, not an effect.
  const [seen, setSeen] = useState(set.published);
  if (seen !== set.published) {
    setSeen(set.published);
    setOn(set.published);
  }

  async function flip(next: boolean) {
    if (busy) return;
    setOn(next);
    setBusy(true);
    try {
      const result = await patchPracticeSet(set.id, { published: next });
      if (!result.ok) {
        setOn(!next);
        toast.error(result.message);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="prx-publish">
        <label htmlFor={id}>{c.publishedToggle}</label>
        <Switch id={id} checked={on} onCheckedChange={flip} disabled={busy} />
      </div>
      {on && set.questionCount === 0 ? (
        <span className="prx-tag prx-tag--empty self-start">{c.publishedButEmpty}</span>
      ) : null}
    </div>
  );
}
