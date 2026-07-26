'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@ayman/ui';
import { apiPatch } from '@/lib/api';

export function ResolveAppealButton({ appealId }: { appealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newMark, setNewMark] = useState(1);
  const [resolverNote, setResolverNote] = useState('');
  const [pending, setPending] = useState(false);

  async function resolve(status: 'accepted' | 'rejected') {
    setPending(true);
    try {
      await apiPatch(`/api/admin/appeals/${appealId}`, {
        status,
        resolverNote,
        ...(status === 'accepted' ? { newMark } : {}),
      });
      toast.success(copy.appeal.resolved);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(copy.appeal.resolveFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {copy.appeal.resolve}
      </Button>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.appeal.resolve}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="new-mark">{copy.appeal.newMark}</Label>
            <Input
              id="new-mark"
              type="number"
              min={0}
              step="0.5"
              value={newMark}
              onChange={(event) => setNewMark(Number(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="resolver-note">{copy.appeal.resolverNote}</Label>
            <Textarea id="resolver-note" value={resolverNote} onChange={(event) => setResolverNote(event.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="danger" onClick={() => void resolve('rejected')} disabled={pending}>
            {copy.appeal.reject}
          </Button>
          <Button type="button" onClick={() => void resolve('accepted')} disabled={pending}>
            {copy.appeal.accept}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
