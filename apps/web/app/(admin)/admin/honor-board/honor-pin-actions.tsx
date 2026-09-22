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
import { removeHonorPinAction } from './actions';

const c = copy.admin.honorBoard;

/**
 * «شيله من اللوحة» — بتأكيد، مش بدوسة واحدة.
 *
 * المسح هنا بيشيل اسم من صفحة عامة، وبيشيل معاه الإشعار اللي وصل للطالب
 * («مبروك، اسمك على لوحة الشرف» على تكريم مابقاش موجود جملة غلط، فالفيد
 * بيرميه). الاتنين مالهمش رجوع، والتأكيد بيقول التانية بالنص عشان
 * مايبقاش مفاجأة.
 */
export function HonorPinActions({ id, name }: { id: string; name: string }) {
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
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.removeConfirmHint}</p>
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
                  const result = await removeHonorPinAction(id);
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
