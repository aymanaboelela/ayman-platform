'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Layers, Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { ExternalBookUnit } from '@ayman/contracts/quiz/external-books';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { createLessonAction, deleteCategoryAction, renameCategoryAction } from '../actions';
import { CategoryActions } from './category-actions';

const c = copy.admin.questionBooks;

function EditableName({
  bookId,
  categoryId,
  name,
  heading,
}: {
  bookId: string;
  categoryId: string;
  name: string;
  heading?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setValue(name);
      return;
    }
    start(async () => {
      const result = await renameCategoryAction(bookId, categoryId, trimmed);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        toast.error(c.renameFailed);
      }
    });
  };

  if (editing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={200} autoFocus className="h-8" />
        <button type="button" onClick={save} disabled={pending} className="shrink-0 rounded-sm p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg">
          <Check className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(name);
            setEditing(false);
          }}
          disabled={pending}
          className="shrink-0 rounded-sm p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const Tag = heading ? 'h3' : 'p';
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Tag className={heading ? 'font-semibold text-fg [overflow-wrap:anywhere]' : 'font-medium text-fg [overflow-wrap:anywhere]'}>
        {name}
      </Tag>
      <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-sm p-1 text-fg-muted hover:bg-surface-3 hover:text-fg" aria-label={c.rename}>
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function DeleteButton({ bookId, categoryId, name }: { bookId: string; categoryId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = () => {
    if (!window.confirm(formatCopy(c.deleteConfirm, { name }))) return;
    start(async () => {
      const result = await deleteCategoryAction(bookId, categoryId);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.message?.includes('400') ? c.deleteNotEmpty : c.deleteFailed);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line px-3 text-[length:var(--fs-text-xs)] text-err transition-colors hover:bg-[color-mix(in_oklab,var(--color-err)_12%,transparent)] disabled:opacity-60"
    >
      <Trash2 className="size-3.5" aria-hidden="true" />
      {c.deleteCategory}
    </button>
  );
}

function AddLessonForm({ bookId, unitId }: { bookId: string; unitId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, start] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    start(async () => {
      const result = await createLessonAction(bookId, unitId, trimmed);
      if (result.ok) {
        setName('');
        router.refresh();
      } else {
        toast.error(c.failed);
      }
    });
  };

  return (
    <form action={submit} className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={c.lessonPlaceholder}
        maxLength={200}
        className="h-9 max-w-xs"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending || name.trim().length === 0}>
        <Plus className="size-3.5" aria-hidden="true" />
        {c.addLesson}
      </Button>
    </form>
  );
}

/** `linked` — الكتاب مربوط بكورس، فكل درس بيقول بياخد أسئلته أنهي محاضرة. */
export function UnitCard({ bookId, unit, linked }: { bookId: string; unit: ExternalBookUnit; linked: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Layers className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <EditableName bookId={bookId} categoryId={unit.categoryId} name={unit.name} heading />
          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {unit.ready > 0 ? formatCopy(c.ready, { n: unit.ready }) : c.none}
          </span>
        </div>
        <DeleteButton bookId={bookId} categoryId={unit.categoryId} name={unit.name} />
      </div>
      <div className="mt-2">
        <CategoryActions categoryId={unit.categoryId} name={unit.name} ready={unit.ready} />
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
        {unit.lessons.length === 0 ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noLessons}</p>
        ) : (
          unit.lessons.map((lesson) => (
            <div key={lesson.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface-1 p-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <EditableName bookId={bookId} categoryId={lesson.categoryId} name={lesson.name} />
                <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                  {lesson.ready > 0 ? formatCopy(c.ready, { n: lesson.ready }) : c.none}
                </span>
                {linked ? (
                  <span
                    className={
                      lesson.linkedLesson
                        ? 'inline-flex min-w-0 items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-ok'
                        : 'shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted'
                    }
                  >
                    {lesson.linkedLesson ? (
                      <>
                        <Link2 className="size-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{formatCopy(c.linkedTo, { title: lesson.linkedLesson.title })}</span>
                      </>
                    ) : (
                      c.notLinkedYet
                    )}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryActions categoryId={lesson.categoryId} name={lesson.name} ready={lesson.ready} />
                <DeleteButton bookId={bookId} categoryId={lesson.categoryId} name={lesson.name} />
              </div>
            </div>
          ))
        )}
        <div className="mt-1">
          <AddLessonForm bookId={bookId} unitId={unit.id} />
        </div>
      </div>
    </div>
  );
}
