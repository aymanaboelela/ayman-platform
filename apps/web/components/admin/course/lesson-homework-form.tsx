'use client';

import Link from 'next/link';
import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { DEFAULT_HOMEWORK_IMAGES, MAX_HOMEWORK_IMAGES } from '@ayman/contracts/homework';
import { Button } from '@ayman/ui/components/button';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { Textarea } from '@ayman/ui/components/textarea';
import {
  removeLessonHomeworkAction,
  setLessonHomeworkAction,
} from '@/app/(admin)/admin/courses/actions';
import { ConfirmButton } from './confirm-button';
import { useAutosave } from './autosave';

const c = copy.admin.homework;

export interface LessonHomeworkDraft {
  body: string;
  maxImages: number;
  isPublished: boolean;
}

/**
 * الواجب, inside the lesson panel — beside the video, the text and the
 * materials, because that is what it is: part of the lecture's own content.
 *
 * ## It starts as a button, not as a blank form
 *
 * Most lectures have no homework — «أوقات أصلاً فيه حاجات ماضفلهاش واجبات» —
 * and an empty textarea on every panel would be forty invitations to fill in
 * something nobody wants. Pressing «أضف واجب» is what creates the row, with
 * `isPublished: false`, so the first keystroke is already a saved draft that no
 * student can see.
 *
 * ## Autosaved, which is exactly why publishing is its own switch
 *
 * Every field here writes on a pause, like the rest of this editor. If the
 * row's mere existence made the exercise visible, half a typed sentence would
 * be on every enrolled student's screen while he is still writing it. The
 * switch is the one decision — the same separation `Lesson.isPublished` makes
 * from the lesson itself.
 */
export function LessonHomeworkForm({
  courseId,
  lessonId,
  homework,
  pendingCount,
}: {
  courseId: string;
  lessonId: string;
  homework: LessonHomeworkDraft | null;
  /** How many answers are waiting on a decision, from the payload the editor
   *  already fetched — so the panel can say «فيه ٤ مستنيين» without a request. */
  pendingCount: number;
}) {
  const [draft, setDraft] = useState<LessonHomeworkDraft | null>(homework);
  const { save } = useAutosave<LessonHomeworkDraft>({
    onSave: (value) => setLessonHomeworkAction(courseId, lessonId, value),
  });

  function update(patch: Partial<LessonHomeworkDraft>) {
    setDraft((current) => {
      const next = { ...(current ?? BLANK), ...patch };
      // The body has a floor of three characters in the schema, so a field on
      // its way to a real sentence is not sent — the same rule
      // `LessonTitleField` follows, and for the same reason: nothing reverts,
      // the write simply waits for the value to be legal.
      if (next.body.trim().length >= 3) save(next);
      return next;
    });
  }

  if (draft === null) {
    return (
      <div className="mt-4 border-t border-line pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDraft({ ...BLANK })}
        >
          <NotebookPen className="size-4" aria-hidden="true" />
          {c.add}
        </Button>
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-[var(--r-md)] border border-line bg-surface-2 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-[length:var(--fs-text-base)] font-semibold text-fg">
          <NotebookPen className="size-4 text-accent-text" aria-hidden="true" />
          {c.title}
        </h4>
        {/* «فيه ٤ حل مستني مراجعة» — a link, not a number, because knowing
            there is work waiting and being unable to reach it from here is
            worse than not knowing. */}
        {pendingCount > 0 ? (
          <Link
            href="/admin/homework"
            className="rounded-full border border-accent/50 bg-accent/10 px-2.5 py-1 text-[length:var(--fs-text-xs)] font-semibold text-accent-text tabular-nums"
          >
            {c.pendingBefore} {pendingCount} {c.pendingAfter}
          </Link>
        ) : null}
      </div>

      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.hint}</p>

      <div className="mt-3">
        <Label htmlFor={`homework-body-${lessonId}`}>{c.body}</Label>
        <Textarea
          id={`homework-body-${lessonId}`}
          rows={4}
          maxLength={4000}
          value={draft.body}
          placeholder={c.bodyPlaceholder}
          onChange={(event) => update({ body: event.target.value })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div className="w-[10rem]">
          <Label htmlFor={`homework-max-${lessonId}`}>{c.maxImages}</Label>
          <Select
            id={`homework-max-${lessonId}`}
            value={String(draft.maxImages)}
            onChange={(event) => update({ maxImages: Number(event.target.value) })}
          >
            {IMAGE_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2.5 pb-2">
          <Switch
            id={`homework-published-${lessonId}`}
            checked={draft.isPublished}
            onCheckedChange={(checked) => update({ isPublished: checked })}
          />
          <Label htmlFor={`homework-published-${lessonId}`} className="cursor-pointer">
            {c.published}
          </Label>
        </div>
      </div>

      <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.publishedHint}</p>

      <div className="mt-3">
        <ConfirmButton
          label={c.remove}
          title={c.remove}
          body={c.removeConfirm}
          // The consequence line is deliberately empty: removing the exercise
          // does NOT delete what students handed in (see
          // `LessonService.removeHomework`), so there is no number to warn
          // about, and a confirmation that always warns teaches him to click
          // through it without reading.
          onConfirm={async () => {
            const result = await removeLessonHomeworkAction(courseId, lessonId);
            if (result.ok) setDraft(null);
            return result;
          }}
        />
      </div>
    </section>
  );
}

const BLANK: LessonHomeworkDraft = {
  body: '',
  maxImages: DEFAULT_HOMEWORK_IMAGES,
  isPublished: false,
};

/** 1…8 — the CHECK's own range, derived rather than restated. */
const IMAGE_OPTIONS = Array.from({ length: MAX_HOMEWORK_IMAGES }, (_, index) => index + 1);
