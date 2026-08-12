'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import type { QuizPaper } from '@ayman/contracts/quiz/quiz-settings';
import { apiDelete } from '@/lib/api';
import { SlotList, type QuizSlotRow } from './slot-list';

export function RemovableSlotList({
  quizId,
  slots,
  paper,
  categories,
}: {
  quizId: string;
  slots: QuizSlotRow[];
  paper: QuizPaper;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();

  async function onRemove(slotId: string) {
    try {
      await apiDelete(`/api/admin/quizzes/${quizId}/slots/${slotId}`);
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    }
  }

  return (
    // Keyed on the slot id SET (not the reorder-time positions) so a slot
    // add/remove — which changes MEMBERSHIP, not just order — always mounts
    // a fresh `SlotList`/`SortableList` instance instead of replaying a
    // debounce hook's now-stale internal order (see `option-rows.tsx`'s own
    // doc comment for the identical failure mode this sidesteps).
    <SlotList
      key={[...slots.map((slot) => slot.id)].sort().join('|')}
      quizId={quizId}
      slots={slots}
      paper={paper}
      onRemove={onRemove}
      categories={categories}
    />
  );
}
