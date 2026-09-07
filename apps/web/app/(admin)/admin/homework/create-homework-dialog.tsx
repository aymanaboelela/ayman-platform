'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { MAX_HOMEWORK_IMAGES } from '@ayman/contracts/homework';
import { Button } from '@ayman/ui/components/button';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { Textarea } from '@ayman/ui/components/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { createHomeworkAction, loadCourseLessonsAction } from './actions';

const c = copy.admin.homework;

export interface HomeworkCourseOption {
  id: string;
  title: string;
}

interface LessonPick {
  id: string;
  title: string;
  kind: string;
  isPublished: boolean;
  homework: { body: string; maxImages: number; isPublished: boolean } | null;
}

interface SectionPick {
  id: string;
  title: string;
  lessons: LessonPick[];
}

/**
 * «أضيف واجب» — from the queue, in one dialog.
 *
 * ## Why this exists when the lesson panel already could
 *
 * It could, four clicks deep inside `/admin/courses/[id]`, on a screen opened
 * to edit a lecture. «أضغط على بلاس أقدر إني أضيف واجب» starts from the
 * الواجبات screen, so the two questions the panel answers implicitly — which
 * course, which lecture — are asked explicitly here, in that order.
 *
 * ## It attaches to an EXISTING lecture and never creates one
 *
 * A واجب is not a lesson kind (the enum is video/quiz/attachment/text); it
 * hangs off any lecture, and the usual case is a video that also sets an
 * exercise. So the second picker lists lectures of every kind and there is no
 * "new lesson" option — a homework with no lecture would have nowhere to
 * appear and no access rule to inherit.
 *
 * ## Picking a lecture that already has one OPENS IT, filled
 *
 * The write is an upsert, so "add" and "edit" are the same call. A blank field
 * over existing questions is a field the instructor overwrites without ever
 * being shown what was there — so the form loads from the outline's own
 * `homework` block, and the button says «حدّث» instead of «أضف».
 */
export function CreateHomeworkDialog({ courses }: { courses: HomeworkCourseOption[] }) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [sections, setSections] = useState<SectionPick[]>([]);
  const [loadingLessons, startLoading] = useTransition();
  const [lessonId, setLessonId] = useState('');
  const [body, setBody] = useState('');
  const [maxImages, setMaxImages] = useState(4);
  const [isPublished, setIsPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  const lessons = sections.flatMap((section) => section.lessons);
  const chosen = lessons.find((lesson) => lesson.id === lessonId) ?? null;
  const isEdit = chosen?.homework != null;

  function reset() {
    setCourseId('');
    setSections([]);
    setLessonId('');
    setBody('');
    setMaxImages(4);
    setIsPublished(false);
  }

  function pickCourse(id: string) {
    setCourseId(id);
    // Everything downstream belonged to the previous course.
    setSections([]);
    setLessonId('');
    setBody('');
    if (id === '') return;

    startLoading(async () => {
      const result = await loadCourseLessonsAction(id);
      if (!result.ok) {
        toast.error(c.createLessonsFailed);
        return;
      }
      setSections(result.sections);
    });
  }

  function pickLesson(id: string) {
    setLessonId(id);
    const lesson = lessons.find((item) => item.id === id) ?? null;
    // Filled from what is already on the lecture — never blank over it.
    setBody(lesson?.homework?.body ?? '');
    setMaxImages(lesson?.homework?.maxImages ?? 4);
    setIsPublished(lesson?.homework?.isPublished ?? false);
  }

  async function save() {
    if (lessonId === '' || body.trim().length < 3) return;
    setSaving(true);
    const result = await createHomeworkAction(lessonId, {
      body: body.trim(),
      maxImages,
      isPublished,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.message || c.createFailed);
      return;
    }
    toast.success(isPublished ? c.createPublished : c.createSavedDraft);
    setOpen(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="size-4" aria-hidden="true" />
          {c.createTrigger}
        </Button>
      </DialogTrigger>

      <DialogContent closeLabel={c.createBack}>
        <DialogHeader>
          <DialogTitle>{c.createTitle}</DialogTitle>
        </DialogHeader>

        <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
          {c.createCourseLabel}
          <Select value={courseId} onChange={(event) => pickCourse(event.target.value)}>
            <option value="">{c.createCoursePlaceholder}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </Select>
        </label>

        {courseId !== '' ? (
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.createLessonLabel}
            <Select
              value={lessonId}
              disabled={loadingLessons || sections.length === 0}
              onChange={(event) => pickLesson(event.target.value)}
            >
              <option value="">
                {loadingLessons
                  ? c.createLessonsLoading
                  : sections.length === 0
                    ? c.createNoLessons
                    : c.createLessonPlaceholder}
              </option>
              {/* Grouped by section, so the list reads like the course outline
                  he already knows rather than as one long flat list. */}
              {sections.map((section) => (
                <optgroup key={section.id} label={section.title}>
                  {section.lessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.homework ? `● ${lesson.title}` : lesson.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </label>
        ) : null}

        {chosen ? (
          <>
            {/* Two warnings that cost a support call each, said at the moment
                they apply rather than in a help page. */}
            {isEdit ? (
              <p className="rounded-md border border-line-subtle bg-surface-2 px-3 py-2 text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.createAlreadyHas}
              </p>
            ) : null}
            {!chosen.isPublished ? (
              <p className="rounded-md border border-[color-mix(in_oklch,var(--warn),transparent_70%)] bg-[color-mix(in_oklch,var(--warn),transparent_92%)] px-3 py-2 text-[length:var(--fs-text-xs)] text-fg">
                {c.createLessonUnpublished}
              </p>
            ) : null}

            <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
              {c.body}
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={c.bodyPlaceholder}
                rows={6}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
              {c.maxImages}
              <Select
                value={String(maxImages)}
                onChange={(event) => setMaxImages(Number(event.target.value))}
              >
                {Array.from({ length: MAX_HOMEWORK_IMAGES }, (_, index) => index + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>

            <div>
              <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
                <Switch checked={isPublished} onCheckedChange={setIsPublished} />
                {c.published}
              </label>
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.publishedHint}
              </p>
            </div>
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {c.createBack}
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving || lessonId === '' || body.trim().length < 3}
            className={cn(saving && 'opacity-70')}
          >
            {saving ? c.createSaving : isEdit ? c.createUpdate : c.createConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
