'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import { MAX_ESSAY_MARKS, type AdminEssay } from '@ayman/contracts/daily-essay';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Textarea } from '@ayman/ui/components/textarea';
import { removeEssayAction, updateEssayAction } from './actions';
import { CoursePicker, type CoursePick } from './course-picker';

const c = dailyEssayCopy.admin;

/**
 * The three things done to one scheduled question, as a button each on its own
 * row: «تعديل», «إخفاء/إظهار», «حذف».
 *
 * «حذف» is offered only while nobody has answered. After that the API refuses
 * it (the question is a record of what students were marked on) and the way
 * off the students' screens is «إخفاء» — so a button that could only ever fail
 * is not drawn.
 */
export function EssayRowActions({ essay, courses }: { essay: AdminEssay; courses: readonly CoursePick[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => ReturnType<typeof updateEssayAction>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.reason === 'refused' ? c.schedule.removeRefused : c.schedule.failed);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="chip chip--quiet" disabled={pending} onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden="true" />
          {c.schedule.edit}
        </button>
        <button
          type="button"
          className="chip chip--quiet"
          disabled={pending}
          onClick={() => run(() => updateEssayAction(essay.id, { isPublished: !essay.isPublished }))}
        >
          {essay.isPublished ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
          {essay.isPublished ? c.schedule.hide : c.schedule.show}
        </button>
        {essay.submitted === 0 ? (
          <button
            type="button"
            className="chip chip--quiet text-[color:var(--err)]"
            disabled={pending}
            onClick={() => {
              if (window.confirm(c.schedule.removeConfirm)) run(() => removeEssayAction(essay.id));
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {c.schedule.remove}
          </button>
        ) : null}
      </div>

      {editing ? (
        <EssayEditDialog essay={essay} courses={courses} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
}

/** Mounted only while open, so its fields start from the row as it is NOW. */
function EssayEditDialog({
  essay,
  courses,
  onClose,
}: {
  essay: AdminEssay;
  courses: readonly CoursePick[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [day, setDay] = useState(essay.day);
  const [body, setBody] = useState(essay.body);
  const [modelAnswer, setModelAnswer] = useState(essay.modelAnswer);
  const [maxMarks, setMaxMarks] = useState(String(essay.maxMarks));
  const [courseIds, setCourseIds] = useState(essay.courses.map((course) => course.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (body.trim().length < 3 || modelAnswer.trim().length < 1 || !(Number(maxMarks) >= 1)) {
      setError(c.form.incomplete);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateEssayAction(essay.id, {
        day,
        body: body.trim(),
        modelAnswer: modelAnswer.trim(),
        maxMarks: Math.round(Number(maxMarks)),
        courseIds,
      });
      if (!result.ok) {
        setError(c.form.failed);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent closeLabel={c.form.back} className="flex max-w-[600px] flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{c.form.editTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.form.day}
            <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.form.maxMarks}
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_ESSAY_MARKS}
              step={1}
              value={maxMarks}
              onChange={(event) => setMaxMarks(event.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
          {c.form.body}
          <Textarea rows={4} maxLength={4000} dir="auto" value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
          {c.form.modelAnswer}
          <Textarea
            rows={5}
            maxLength={8000}
            dir="auto"
            value={modelAnswer}
            onChange={(event) => setModelAnswer(event.target.value)}
          />
        </label>

        <CoursePicker
          courses={courses}
          value={courseIds}
          onChange={setCourseIds}
          label={c.form.courses}
          hint={c.form.coursesHint}
          searchLabel={c.form.coursesSearch}
        />

        {error ? (
          <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? c.form.saving : c.form.saveEdit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
