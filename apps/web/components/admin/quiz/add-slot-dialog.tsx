'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import type { QuizPaper } from '@ayman/contracts/quiz/quiz-settings';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { apiGet, apiPost } from '@/lib/api';

const BankRowSchema = z.object({
  id: z.string(),
  category: z.object({ id: z.string(), name: z.string() }),
  // `hidden` (a retired question, see the identical comment in the bank list
  // page) must still parse here even though the picker filters it straight
  // back out below — otherwise one hidden entry anywhere in the bank throws
  // a `ZodError` and breaks the picker for every quiz.
  versions: z.array(z.object({ id: z.string(), status: z.enum(['draft', 'ready', 'hidden']), stemHtml: z.string() })),
});

const CreatedSlotSchema = z.object({ id: z.string() });

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim().slice(0, 80);
}

/** Search + pick a ready question from the bank, and add it as one slot. */
export function AddSlotDialog({ quizId, paper }: { quizId: string; paper: QuizPaper }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<z.infer<typeof BankRowSchema>[]>([]);
  const [maxMark, setMaxMark] = useState(1);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const data = await apiGet(`/api/admin/questions?${params}`, z.array(BankRowSchema));
      setRows(data.filter((row) => row.versions[0]?.status === 'ready'));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, search]);

  async function pick(bankEntryId: string) {
    try {
      await apiPost(`/api/admin/quizzes/${quizId}/slots`, CreatedSlotSchema, { bankEntryId, maxMark, paper });
      toast.success(copy.admin.common.saved);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {copy.quizAdmin.addSlot}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{copy.quizAdmin.addSlot}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <Label htmlFor="slot-search">{copy.quizAdmin.searchQuestions}</Label>
              <Input id="slot-search" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="slot-max-mark">{copy.quizAdmin.defaultMark}</Label>
              <Input
                id="slot-max-mark"
                type="number"
                min={0}
                step="0.5"
                value={maxMark}
                onChange={(event) => setMaxMark(Number(event.target.value))}
                className="w-24"
              />
            </div>
          </div>

          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.common.empty}</p>
            ) : (
              rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => pick(row.id)}
                    className="w-full rounded-sm border border-line-subtle bg-surface-2 p-2 text-start text-fg hover:border-accent"
                  >
                    <span className="block truncate">{stripHtml(row.versions[0]?.stemHtml ?? '')}</span>
                    <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">{row.category.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {copy.admin.common.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
