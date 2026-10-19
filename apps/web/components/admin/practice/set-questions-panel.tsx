'use client';

import { useId, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, FileQuestion, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCopy } from '@ayman/contracts/format';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { PracticeQuestion } from '@ayman/contracts/practice';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import {
  addPracticeQuestions,
  deletePracticeQuestion,
  reorderPracticeQuestions,
  updatePracticeQuestion,
} from '@/app/(admin)/admin/practice/actions';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { useDebouncedReorder, type ReorderStatus } from '@/components/admin/use-debounced-reorder';
import { PasteQuestionsDialog } from './paste-questions-dialog';
import { QuestionEditor } from './question-editor';
import { QuestionExplanation, QuestionOptions } from './question-body';

const q = c.question;

/**
 * The set's questions: the two ways in (one at a time, or a paste), and the
 * list — every card showing its key, with its own «تعديل» and «حذف», and two
 * ways to move it (drag the handle, or the arrows for whoever does not drag).
 *
 * Every write ends in `router.refresh()` — `next.config.ts` lets the router
 * reuse a dynamic route for 30 seconds, and a question that was saved but
 * does not appear reads as a save that failed (see `bulk-import-dialog.tsx`).
 */
export function SetQuestionsPanel({ setId, questions }: { setId: string; questions: PracticeQuestion[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(questions.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; number: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function addOne(input: Parameters<typeof updatePracticeQuestion>[1]): Promise<boolean> {
    const result = await addPracticeQuestions(setId, [input]);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    toast.success(q.added);
    router.refresh();
    return true;
  }

  async function saveOne(id: string, input: Parameters<typeof updatePracticeQuestion>[1]): Promise<boolean> {
    const result = await updatePracticeQuestion(id, input);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    toast.success(q.savedToast);
    setEditing(null);
    router.refresh();
    return true;
  }

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      const result = await deletePracticeQuestion(deleting.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(q.deleted);
      setDeleting(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Remount the list when the SET of questions changes (an add, a delete),
  // not when only their order does: the reorder hook seeds its local order
  // once, so a new id would otherwise never appear in it.
  const membership = questions
    .map((question) => question.id)
    .sort()
    .join(',');

  return (
    <section className="prx-main" aria-labelledby="practice-questions-heading">
      <div className="prx-section-head">
        <h2 id="practice-questions-heading" className="prx-section-head__title">
          <span className="prx-panel__well" aria-hidden="true">
            <FileQuestion className="size-4" />
          </span>
          {c.editor.questions}
          <span className="prx-count">{questions.length}</span>
        </h2>
        <div className="prx-section-head__actions">
          <button
            type="button"
            className="chip chip--solid"
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
            aria-expanded={adding}
          >
            <Plus className="size-4" aria-hidden="true" />
            {c.editor.add}
          </button>
          <PasteQuestionsDialog setId={setId} />
        </div>
      </div>

      {adding ? (
        <QuestionEditor
          submitLabel={q.add}
          onSubmit={addOne}
          onCancel={questions.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : null}

      {questions.length === 0 ? (
        <AdminEmpty spot="topics" title={c.editor.noQuestions} hint={c.editor.noQuestionsHint} />
      ) : (
        <QuestionList
          key={membership}
          setId={setId}
          questions={questions}
          editing={editing}
          onEdit={(id) => {
            setEditing(id);
            setAdding(false);
          }}
          onCancelEdit={() => setEditing(null)}
          onSave={saveOne}
          onDelete={(id, number) => setDeleting({ id, number })}
        />
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => (open ? null : setDeleting(null))}>
        <DialogContent closeLabel={c.actions.close}>
          <DialogHeader>
            <DialogTitle>{formatCopy(q.deleteTitle, { n: deleting?.number ?? '' })}</DialogTitle>
            <DialogDescription>{q.deleteBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              {c.actions.cancel}
            </Button>
            <button type="button" className="chip prx-danger-solid h-10" onClick={confirmDelete} disabled={busy}>
              <Trash2 className="size-4" aria-hidden="true" />
              {q.deleteConfirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function QuestionList({
  setId,
  questions,
  editing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  setId: string;
  questions: PracticeQuestion[];
  editing: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSave: (id: string, input: Parameters<typeof updatePracticeQuestion>[1]) => Promise<boolean>;
  onDelete: (id: string, number: number) => void;
}) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const { items: order, status, move } = useDebouncedReorder({
    initial: [...questions].sort((a, b) => a.position - b.position).map((question) => question.id),
    onCommit: async (ids) => {
      const result = await reorderPracticeQuestions(setId, ids);
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
  });

  const sensors = useSensors(
    // 8px before a drag starts, so a click on the handle is still a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Keyboard reordering is not optional — mouse-only is a WCAG 2.1.1 failure.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const at = (id: unknown) => order.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => formatCopy(q.announce.pickedUp, { n: at(active.id) }),
    onDragOver: ({ over }) => (over ? formatCopy(q.announce.movedOver, { n: at(over.id) }) : undefined),
    onDragEnd: ({ over }) => (over ? formatCopy(q.announce.dropped, { n: at(over.id) }) : undefined),
    onDragCancel: () => q.announce.cancelled,
  };

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    move(order.indexOf(String(active.id)), order.indexOf(String(over.id)));
  }

  return (
    <div className="flex flex-col gap-2">
      <ReorderStatusLine status={status} />
      <DndContext
        // Explicit id: dnd-kit's generated one differs between server and
        // client and warns on hydration (same note as `sortable-list.tsx`).
        id={useId()}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        accessibility={{ announcements }}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={editing !== null}>
          <ol className="flex flex-col gap-3">
            {order.map((id, index) => {
              const question = byId.get(id);
              if (!question) return null;
              return (
                <SortableQuestion
                  key={id}
                  question={question}
                  number={index + 1}
                  total={order.length}
                  editing={editing === id}
                  locked={editing !== null}
                  onUp={() => move(index, index - 1)}
                  onDown={() => move(index, index + 1)}
                  onEdit={() => onEdit(id)}
                  onCancelEdit={onCancelEdit}
                  onSave={(input) => onSave(id, input)}
                  onDelete={() => onDelete(id, index + 1)}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function ReorderStatusLine({ status }: { status: ReorderStatus }) {
  const text =
    status === 'saving' || status === 'pending'
      ? q.reorderSaving
      : status === 'saved'
        ? q.reorderSaved
        : status === 'error'
          ? q.reorderFailed
          : '';
  return (
    <p
      className={cn('prx-reorder-status', status === 'error' && 'prx-reorder-status--error')}
      role={status === 'error' ? 'alert' : 'status'}
    >
      {text}
    </p>
  );
}

function SortableQuestion({
  question,
  number,
  total,
  editing,
  locked,
  onUp,
  onDown,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  question: PracticeQuestion;
  number: number;
  total: number;
  editing: boolean;
  locked: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (input: Parameters<typeof updatePracticeQuestion>[1]) => Promise<boolean>;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };

  if (editing) {
    return (
      <li ref={setNodeRef} style={style}>
        <QuestionEditor
          initial={question}
          number={number}
          submitLabel={q.save}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      </li>
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10 opacity-80')}>
      <article className={cn('prx-q', question.type === 'tf' && 'prx-q--tf')}>
        <div className="prx-q__top">
          <span className="prx-q__num" aria-label={formatCopy(q.number, { n: number })}>
            {number}
          </span>
          <span className="prx-type">{q.types[question.type]}</span>
          <span className="prx-q__tools">
            <button
              type="button"
              className="prx-icon-btn"
              onClick={onUp}
              disabled={locked || number === 1}
              aria-label={formatCopy(q.moveUp, { n: number })}
              title={formatCopy(q.moveUp, { n: number })}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="prx-icon-btn"
              onClick={onDown}
              disabled={locked || number === total}
              aria-label={formatCopy(q.moveDown, { n: number })}
              title={formatCopy(q.moveDown, { n: number })}
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="prx-icon-btn prx-icon-btn--drag"
              disabled={locked}
              aria-label={formatCopy(q.drag, { n: number })}
              title={formatCopy(q.drag, { n: number })}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
          </span>
        </div>

        <p className="prx-q__stem" dir="auto">
          {question.stem}
        </p>
        <QuestionOptions type={question.type} options={question.options} answer={question.answer} />
        <QuestionExplanation text={question.explanation} />

        <div className="prx-q__foot">
          <button type="button" className="chip chip--accent" onClick={onEdit} disabled={locked}>
            <Pencil className="size-4" aria-hidden="true" />
            {q.edit}
          </button>
          <button type="button" className="chip prx-danger" onClick={onDelete} disabled={locked}>
            <Trash2 className="size-4" aria-hidden="true" />
            {q.delete}
          </button>
        </div>
      </article>
    </li>
  );
}
