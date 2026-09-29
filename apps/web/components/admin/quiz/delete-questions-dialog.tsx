'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Archive, Ban, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  QuestionRemovalPlanSchema,
  QuestionRemovalResultSchema,
  countRemoval,
  type QuestionRemovalItem,
  type QuestionRemovalOutcome,
  type QuestionRemovalPlan,
} from '@ayman/contracts/quiz/question-removal';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { apiPost } from '@/lib/api';
import './question-bank.css';

const c = copy.quizAdmin.bank;

const GROUPS: { outcome: QuestionRemovalOutcome; title: string; hint: string; icon: typeof Trash2 }[] = [
  { outcome: 'delete', title: c.deleteGroupDelete, hint: c.deleteGroupDeleteHint, icon: Trash2 },
  { outcome: 'archive', title: c.deleteGroupArchive, hint: c.deleteGroupArchiveHint, icon: Archive },
  { outcome: 'blocked', title: c.deleteGroupBlocked, hint: c.deleteGroupBlockedHint, icon: Ban },
];

/**
 * «امسح» — the confirm, and it says what WILL happen before the click.
 *
 * Opening it asks the server for the plan (`/delete-plan`, read-only): which
 * questions go for good, which leave the bank and keep every result that used
 * them, and which a quiz still holds — with that quiz named and linked. The
 * button then asks for the delete, which the server decides again inside its
 * own transaction; the plan here is what to expect, not a promise.
 *
 * `ids === null` is closed. The caller owns which questions, this owns the
 * round trips.
 */
export function DeleteQuestionsDialog({
  ids,
  onClose,
  onDone,
}: {
  ids: string[] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  // Keyed on the `ids` array it answers, so a dialog reopened on a different
  // selection never flashes the previous plan — without resetting state
  // inside the effect.
  const [loaded, setLoaded] = useState<{ ids: string[]; plan: QuestionRemovalPlan | null } | null>(null);
  const [pending, setPending] = useState(false);
  const open = ids !== null;
  const answered = loaded !== null && loaded.ids === ids;
  const plan = answered ? loaded.plan : null;
  const failed = answered && loaded.plan === null;

  useEffect(() => {
    if (!ids) return;
    let live = true;
    apiPost('/api/admin/questions/delete-plan', QuestionRemovalPlanSchema, { ids })
      .then((next) => {
        if (live) setLoaded({ ids, plan: next });
      })
      .catch(() => {
        if (live) setLoaded({ ids, plan: null });
      });
    return () => {
      live = false;
    };
  }, [ids]);

  const counts = countRemoval(plan?.items ?? []);
  const removable = counts.delete + counts.archive;
  const single = (ids?.length ?? 0) === 1;

  async function confirm() {
    if (!ids) return;
    setPending(true);
    try {
      const result = await apiPost('/api/admin/questions/delete', QuestionRemovalResultSchema, { ids });
      const parts = [
        result.deleted > 0 ? formatCopy(c.deleteDoneDeleted, { n: result.deleted }) : null,
        result.archived > 0 ? formatCopy(c.deleteDoneArchived, { n: result.archived }) : null,
        result.blocked.length > 0 ? formatCopy(c.deleteDoneBlocked, { n: result.blocked.length }) : null,
      ].filter(Boolean);
      if (result.deleted + result.archived > 0) toast.success(parts.join(' · '));
      else toast.info(parts.join(' · ') || c.deleteNothing);
      onDone();
    } catch {
      toast.error(c.deleteFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent closeLabel={copy.admin.common.close} className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{single ? c.deleteTitleOne : formatCopy(c.deleteTitle, { n: ids?.length ?? 0 })}</DialogTitle>
          <DialogDescription>
            {failed ? c.deletePlanFailed : plan ? null : c.deleteLoading}
          </DialogDescription>
        </DialogHeader>

        {plan ? (
          <div className="flex flex-col gap-3">
            {GROUPS.map((group) => {
              const items = plan.items.filter((item) => item.outcome === group.outcome);
              if (items.length === 0) return null;
              const Icon = group.icon;
              return (
                <section key={group.outcome} className={`qdel__group qdel__group--${group.outcome}`}>
                  <p className="qdel__title">
                    <Icon className="size-4" aria-hidden="true" />
                    {group.title}
                    <span className="qbank-cat__count">{items.length}</span>
                  </p>
                  <p className="qdel__hint">{group.hint}</p>
                  <ul className="qdel__items">
                    {items.map((item) => (
                      <PlanItem key={item.bankEntryId} item={item} />
                    ))}
                  </ul>
                </section>
              );
            })}
            {removable === 0 ? <p className="qdel__hint">{c.deleteNothing}</p> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {copy.admin.common.cancel}
          </Button>
          <Button type="button" variant="danger" onClick={() => void confirm()} disabled={!plan || removable === 0 || pending}>
            <Trash2 className="size-4" aria-hidden="true" />
            {single ? c.deleteConfirmOne : formatCopy(c.deleteConfirm, { n: removable })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanItem({ item }: { item: QuestionRemovalItem }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="line-clamp-2">{item.stem || '—'}</span>
      {item.quizzes.map((quiz) => (
        <span key={quiz.quizId} className="qdel__quiz">
          <Link href={`/admin/quizzes/${quiz.quizId}`}>{quiz.title}</Link>
          <span>· {quiz.courseTitle}</span>
          <span>· {quiz.isPublished ? c.deletePublished : c.deleteDraft}</span>
          {quiz.via === 'pool' ? <span>· {c.deleteViaPool}</span> : null}
        </span>
      ))}
    </li>
  );
}
