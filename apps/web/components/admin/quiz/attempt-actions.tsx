'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { Button, Input } from '@ayman/ui';
import { apiPost } from '@/lib/api';

const OkResultSchema = z.object({ ok: z.boolean() });

export interface AttemptActionsProps {
  attemptId: string;
  quizId: string;
  userId: string;
  canReopen: boolean;
}

/** Row actions behind a confirmation, each followed by a `sonner` toast —
 *  reopen, grant extra time, grant an extra attempt. All three are
 *  `attempt:unlock`-gated server-side regardless of what this renders. */
export function AttemptActions({ attemptId, quizId, userId, canReopen }: AttemptActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [extraMinutes, setExtraMinutes] = useState(10);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    try {
      await action();
      toast.success(copy.quizAdmin.actionSucceeded);
      router.refresh();
    } catch {
      toast.error(copy.quizAdmin.actionFailed);
    } finally {
      setPending(false);
    }
  }

  function reopen() {
    if (!window.confirm(copy.quizAdmin.confirmReopen)) return;
    void run(() =>
      apiPost(`/api/admin/attempts/${attemptId}/reopen`, OkResultSchema, { extraSeconds: extraMinutes * 60 }),
    );
  }

  function grantTime() {
    void run(() =>
      apiPost(`/api/admin/attempts/${attemptId}/extra-time`, OkResultSchema, { seconds: extraMinutes * 60 }),
    );
  }

  function grantAttempt() {
    if (!window.confirm(copy.quizAdmin.grantAttemptConfirm)) return;
    void run(() => apiPost(`/api/admin/quizzes/${quizId}/students/${userId}/extra-attempt`, OkResultSchema, {}));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="number"
        min={1}
        value={extraMinutes}
        onChange={(event) => setExtraMinutes(Number(event.target.value))}
        aria-label={copy.quizAdmin.grantTimeMinutes}
        className="w-20"
      />
      {canReopen ? (
        <Button type="button" variant="secondary" size="sm" onClick={reopen} disabled={pending}>
          {copy.quizAdmin.reopen}
        </Button>
      ) : null}
      <Button type="button" variant="secondary" size="sm" onClick={grantTime} disabled={pending}>
        {copy.quizAdmin.grantTime}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={grantAttempt} disabled={pending}>
        {copy.quizAdmin.grantAttempt}
      </Button>
    </div>
  );
}
