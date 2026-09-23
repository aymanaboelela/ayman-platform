'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { unpinExamFromBoardAction } from './actions';

const c = copy.admin.honorBoard;

/**
 * «شيله من اللوحة»، للصف اللي جاي من ورقة امتحان.
 *
 * الصفوف دي كانت الوحيدة على الشاشة اللي مالهاش أي زرار غير «افتح الورقة»،
 * والرسالة فوقها كانت بتقول «دول بيتحطوا ويتشالوا من شاشة تصحيح الورق» —
 * يعني بتوصّف رحلة، مش بتدّي مخرج. واللي بيبص على اللوحة هنا هو نفسه اللي
 * عايز يشيل اسم منها، والاسم ده على **صفحة عامة** دلوقتي.
 *
 * ## ليه شيل بس، من غير تعديل
 *
 * الصف ده مالوش حقول خاصة بيه يتعدّلوا: المركز جاي من الدرجة، والعنوان من
 * الامتحان، والاسم من الطالب. تعديل أي واحدة فيهم معناه تغيير الورقة نفسها،
 * ومكانه شاشة التصحيح. اللي ينفع يتقرر هنا هو **قرار واحد**: الاسم ده يفضل
 * على اللوحة ولا لأ.
 *
 * وهو نفس الحقل اللي شاشة التصحيح بتكتبه (`quizAttempts.honorBoardAt`) —
 * مش نسخة تانية من القرار، فمفيش شاشتين ممكن يختلفوا.
 */
export function HonorExamActions({ attemptId, name }: { attemptId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={c.remove}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {c.remove}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={copy.admin.common.cancel}>
          <DialogHeader>
            <DialogTitle>{formatCopy(c.removeConfirm, { name })}</DialogTitle>
          </DialogHeader>
          {/* رسالة مختلفة عن المسح اليدوي عن قصد: الورقة والدرجة مابيحصلهمش
              حاجة، اللي بيتشال هو الاسم من اللوحة — وده اللي بيخلّي القرار
              ده أخف من اللي جنبه، ولازم يقوله. */}
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.examRemoveHint}</p>
          {error ? (
            <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {c.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await unpinExamFromBoardAction(attemptId);
                  if (result.ok) setOpen(false);
                  else setError(result.message);
                })
              }
            >
              {pending ? c.removing : c.remove}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
