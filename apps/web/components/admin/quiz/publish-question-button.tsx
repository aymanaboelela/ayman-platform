'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { RegradeResultSchema } from '@ayman/contracts/quiz/regrade';
import { Button } from '@ayman/ui/components/button';
import { apiPost } from '@/lib/api';
import { RegradeConfirmDialog } from './regrade-confirm-dialog';

const PublishResultSchema = z.object({ ok: z.boolean() });

/**
 * A freshly created or edited question version starts `draft` and stays
 * invisible to `AddSlotDialog` (which only lists `status === 'ready'` rows)
 * until this fires — without it, a hand-authored (non-bulk-import) question
 * can never be attached to a quiz. `bulkImport` already lands its rows as
 * `ready` directly (see its own comment on why), so this button only ever
 * appears for the single-question authoring path.
 *
 * With `bankEntryId` it is publishing an EDIT of a question students already
 * see, so it asks first (`RegradeConfirmDialog`) and offers to mark the
 * answers already given again — the draft may well be the key correction that
 * never went out.
 */
export function PublishQuestionButton({ versionId, bankEntryId }: { versionId: string; bankEntryId?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function publish(regrade: boolean) {
    setPending(true);
    try {
      await apiPost(`/api/admin/questions/${versionId}/publish`, PublishResultSchema, {});
      toast.success(copy.quizAdmin.publish);
      if (regrade && bankEntryId) {
        try {
          const result = await apiPost(`/api/admin/questions/${bankEntryId}/regrade`, RegradeResultSchema, {});
          toast.success(
            result.raised + result.lowered > 0
              ? formatCopy(copy.quizAdmin.regradeDone, { raised: result.raised, lowered: result.lowered })
              : copy.quizAdmin.regradeNoChange,
          );
        } catch {
          toast.error(copy.quizAdmin.regradeFailed);
        }
      }
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => (bankEntryId ? setConfirming(true) : void publish(false))}
        disabled={pending}
      >
        {copy.quizAdmin.publish}
      </Button>
      {bankEntryId ? (
        <RegradeConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={copy.quizAdmin.saveConfirmTitle}
          lines={[copy.quizAdmin.saveConfirmLive]}
          bankEntryId={bankEntryId}
          defaultRegrade
          confirmLabel={copy.quizAdmin.saveConfirmAction}
          pending={pending}
          onConfirm={(regrade) => void publish(regrade)}
        />
      ) : null}
    </>
  );
}
