'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { apiPost } from '@/lib/api';

const PublishResultSchema = z.object({ ok: z.boolean() });

/**
 * A freshly created or edited question version starts `draft` and stays
 * invisible to `AddSlotDialog` (which only lists `status === 'ready'` rows)
 * until this fires — without it, a hand-authored (non-bulk-import) question
 * can never be attached to a quiz. `bulkImport` already lands its rows as
 * `ready` directly (see its own comment on why), so this button only ever
 * appears for the single-question authoring path.
 */
export function PublishQuestionButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function publish() {
    setPending(true);
    try {
      await apiPost(`/api/admin/questions/${versionId}/publish`, PublishResultSchema, {});
      toast.success(copy.quizAdmin.publish);
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={publish} disabled={pending}>
      {copy.quizAdmin.publish}
    </Button>
  );
}
