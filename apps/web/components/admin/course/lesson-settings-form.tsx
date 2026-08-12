'use client';

import { useState } from 'react';
import { StreamChoiceSchema, streamFlagsOf } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import type { ActionResult, UpdateLessonInput } from '@/app/(admin)/admin/courses/actions';
import { StreamChoiceField } from '@/components/admin/stream-choice';

const c = copy.admin.lesson;

type CompletionMode = NonNullable<UpdateLessonInput['completionMode']>;

const MODES = ['none', 'manual', 'on_view', 'on_grade', 'on_pass'] as const;

const MODE_LABEL: Record<CompletionMode, string> = {
  none: c.completionNone,
  manual: c.completionManual,
  on_view: c.completionOnView,
  on_grade: c.completionOnGrade,
  on_pass: c.completionOnPass,
};

/** Just the fields this form writes — not the whole admin lesson row. */
export interface LessonSettings {
  id: string;
  isFreePreview: boolean;
  estimatedSeconds: number;
  completionMode: CompletionMode;
  completionMinViewSeconds: number | null;
  completionPassGrade: number | null;
  forGeneral: boolean;
  forLanguages: boolean;
}

/**
 * Free preview, estimated duration, and the completion rule.
 *
 * Every one of these has been writable through `PATCH /admin/lessons/:id`
 * since the endpoint shipped, and none of them had a control: `createLesson`
 * hard-coded `completionMode: 'manual'` and nothing could ever change it.
 *
 * ## The coupled pair
 *
 * `LessonUpdateSchema.refine` requires `completionMinViewSeconds` when the mode
 * is `on_view`, and `completionPassGrade` when it is `on_grade` or `on_pass`.
 * So this always sends the mode and its dependent value in ONE payload —
 * sending a mode alone is a 400 whose message names a field the admin was
 * never shown. The dependent input is rendered only for the mode that needs
 * it, and both are explicitly nulled for the modes that need neither, so a
 * value left over from a previous mode cannot survive as an invisible rule.
 */
export function LessonSettingsForm({
  lesson,
  courseStream,
  onSave,
}: {
  lesson: LessonSettings;
  /**
   * The course's own pair, so the form can point out a lesson labelled for an
   * audience its course excludes. Optional because the unit test renders this
   * form alone; when absent, no warning is possible and none is shown.
   */
  courseStream?: { forGeneral: boolean; forLanguages: boolean };
  onSave: (input: UpdateLessonInput) => Promise<ActionResult>;
}) {
  const [mode, setMode] = useState<CompletionMode>(lesson.completionMode);
  /**
   * Reads the SAVED lesson, not the radio the admin is currently touching.
   * Live-updating it as they click would flash the warning mid-decision — the
   * useful moment is after a save, when the stored pair is what students see.
   */
  const overlapsCourse =
    (lesson.forGeneral && courseStream?.forGeneral) ||
    (lesson.forLanguages && courseStream?.forLanguages);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const needsViewSeconds = mode === 'on_view';
  const needsPassGrade = mode === 'on_grade' || mode === 'on_pass';

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    setSaved(false);
    const streamChoice = StreamChoiceSchema.safeParse(formData.get('stream'));
    const result = await onSave({
      isFreePreview: formData.get('isFreePreview') === 'on',
      estimatedSeconds: Number(formData.get('estimatedSeconds') ?? 0),
      // A missing radio falls back to what the lesson already is, NOT to
      // `both` — this is a partial update of an existing row, so the safe
      // default is "leave it alone", where on a create form it is "everyone".
      ...(streamChoice.success
        ? streamFlagsOf(streamChoice.data)
        : { forGeneral: lesson.forGeneral, forLanguages: lesson.forLanguages }),
      completionMode: mode,
      completionMinViewSeconds: needsViewSeconds
        ? Number(formData.get('completionMinViewSeconds') ?? 0)
        : null,
      completionPassGrade: needsPassGrade
        ? Number(formData.get('completionPassGrade') ?? 0)
        : null,
    });
    setPending(false);
    if (result.ok) setSaved(true);
    else setError(result.message);
  }

  return (
    <form action={submit} className="mt-4 space-y-3 border-t border-line-subtle pt-4">
      <h5 className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.settings}</h5>

      <StreamChoiceField idPrefix={`lesson-stream-${lesson.id}`} defaults={lesson} />
      {courseStream && !overlapsCourse ? (
        <p className="stream-warning" role="status">
          {copy.stream.lessonOutsideCourse}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id={`preview-${lesson.id}`}
            name="isFreePreview"
            defaultChecked={lesson.isFreePreview}
          />
          <Label htmlFor={`preview-${lesson.id}`}>{c.freePreview}</Label>
        </div>

        <div className="w-40">
          <Label htmlFor={`est-${lesson.id}`}>{c.estimatedSeconds}</Label>
          <Input
            id={`est-${lesson.id}`}
            name="estimatedSeconds"
            type="number"
            min={0}
            max={86400}
            defaultValue={lesson.estimatedSeconds}
          />
        </div>

        <div className="w-52">
          <Label htmlFor={`mode-${lesson.id}`}>{c.completionMode}</Label>
          <Select
            id={`mode-${lesson.id}`}
            value={mode}
            onChange={(event) => setMode(event.target.value as CompletionMode)}
          >
            {MODES.map((value) => (
              <option key={value} value={value}>
                {MODE_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>

        {needsViewSeconds ? (
          <div className="w-44">
            <Label htmlFor={`minview-${lesson.id}`}>{c.minViewSeconds}</Label>
            <Input
              id={`minview-${lesson.id}`}
              name="completionMinViewSeconds"
              type="number"
              min={0}
              defaultValue={lesson.completionMinViewSeconds ?? 0}
              required
            />
          </div>
        ) : null}

        {needsPassGrade ? (
          <div className="w-40">
            <Label htmlFor={`pass-${lesson.id}`}>{c.passGrade}</Label>
            <Input
              id={`pass-${lesson.id}`}
              name="completionPassGrade"
              type="number"
              min={0}
              max={100}
              defaultValue={lesson.completionPassGrade ?? 60}
              required
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {copy.admin.common.save}
        </Button>
        {saved ? (
          <span aria-live="polite" className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {copy.admin.common.saved}
          </span>
        ) : null}
        {error === null ? null : (
          <p role="alert" className="text-[length:var(--fs-text-xs)] text-err">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
