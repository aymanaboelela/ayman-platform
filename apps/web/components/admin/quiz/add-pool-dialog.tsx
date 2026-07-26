'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@ayman/ui';
import { apiPost } from '@/lib/api';

const CreatedPoolSchema = z.object({ id: z.string() });

/** "Pick N at random from a category" — the pool slot. */
export function AddPoolDialog({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pickCount, setPickCount] = useState(5);
  const [pointsPerQuestion, setPointsPerQuestion] = useState(1);
  const [pending, setPending] = useState(false);

  async function commit() {
    setPending(true);
    try {
      await apiPost(`/api/admin/quizzes/${quizId}/pools`, CreatedPoolSchema, {
        name,
        pickCount,
        pointsPerQuestion,
        sourceFilter: {},
      });
      toast.success(copy.admin.common.saved);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {copy.quizAdmin.addPool}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.quizAdmin.addPool}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="pool-name">{copy.quizAdmin.poolName}</Label>
            <Input id="pool-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pool-pick-count">{copy.quizAdmin.poolPickCount}</Label>
              <Input
                id="pool-pick-count"
                type="number"
                min={1}
                value={pickCount}
                onChange={(event) => setPickCount(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="pool-points">{copy.quizAdmin.poolPoints}</Label>
              <Input
                id="pool-points"
                type="number"
                min={0}
                step="0.5"
                value={pointsPerQuestion}
                onChange={(event) => setPointsPerQuestion(Number(event.target.value))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {copy.admin.common.cancel}
          </Button>
          <Button type="button" onClick={commit} disabled={pending || name.trim().length === 0}>
            {copy.admin.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
