'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Copy, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { apiPost } from '@/lib/api';
import { DeleteQuestionsDialog } from './delete-questions-dialog';

const c = copy.quizAdmin.bank;

const DuplicatedSchema = z.object({ bankEntryId: z.string() });
const OkSchema = z.object({ ok: z.boolean() });

/**
 * «نسخة» and «امسح» on the question's own page — the same two the bank's row
 * carries, so a question opened to be fixed can also be retired from where
 * the teacher is already looking at it. An archived question gets
 * «رجّعه للبنك» instead: there is nothing left to delete.
 */
export function QuestionPageActions({ bankEntryId, archived }: { bankEntryId: string; archived: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function duplicate() {
    setBusy(true);
    try {
      const result = await apiPost(`/api/admin/questions/${bankEntryId}/duplicate`, DuplicatedSchema, {});
      toast.success(c.duplicated);
      router.push(`/admin/questions/${result.bankEntryId}`);
    } catch {
      toast.error(copy.admin.common.saveFailed);
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      await apiPost(`/api/admin/questions/${bankEntryId}/restore`, OkSchema, {});
      toast.success(c.restored);
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  if (archived) {
    return (
      <button type="button" className="chip chip--accent" onClick={() => void restore()} disabled={busy}>
        <RotateCcw className="size-4" aria-hidden="true" />
        {c.restore}
      </button>
    );
  }

  return (
    <div className="row-actions">
      <button type="button" className="chip qbank-plain" onClick={() => void duplicate()} disabled={busy}>
        <Copy className="size-4" aria-hidden="true" />
        {c.duplicate}
      </button>
      <span className="row-actions__sep" aria-hidden="true" />
      <button type="button" className="chip chip--danger" onClick={() => setDeleting([bankEntryId])}>
        <Trash2 className="size-4" aria-hidden="true" />
        {c.delete}
      </button>
      <DeleteQuestionsDialog
        ids={deleting}
        onClose={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          // Gone or archived, this page has nothing left to edit — back to the
          // bank, which re-renders without it.
          router.push('/admin/questions');
          router.refresh();
        }}
      />
    </div>
  );
}
