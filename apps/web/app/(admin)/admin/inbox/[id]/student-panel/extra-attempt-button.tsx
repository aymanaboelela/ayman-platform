'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { cn } from '@ayman/ui/lib/cn';
import { apiPost } from '@/lib/api';

const OkResultSchema = z.object({ ok: z.boolean() });

/**
 * «اعمله محاولة» — one more sitting of this exam, in one press.
 *
 * The same route `AttemptActions` calls (`attempt:unlock` server-side), lifted
 * out of the «إجراءات تانية» fold: on the attempts screen it is a rare action
 * among many rows, here it is the reason he opened the exams tab.
 *
 * `router.refresh()` re-renders the thread page with the drawer still open
 * (the `?panel=` param survives a refresh), so the card picks up the change.
 */
export function ExtraAttemptButton({ quizId, userId }: { quizId: string; userId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function grant() {
    if (!window.confirm(c.exams.extraAttemptConfirm)) return;
    setPending(true);
    try {
      await apiPost(
        `/api/admin/quizzes/${encodeURIComponent(quizId)}/students/${encodeURIComponent(userId)}/extra-attempt`,
        OkResultSchema,
        {},
      );
      toast.success(c.exams.extraAttemptDone);
      router.refresh();
    } catch {
      toast.error(c.exams.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void grant()}
      disabled={pending}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[length:var(--fs-text-sm)] font-semibold',
        'bg-accent text-[color:var(--on-accent-ink)] transition-opacity duration-[160ms] ease-out hover:opacity-90',
        'disabled:cursor-wait disabled:opacity-60',
      )}
    >
      <RotateCcw className={cn('size-4', pending && 'animate-spin')} aria-hidden="true" />
      {c.exams.extraAttempt}
    </button>
  );
}
