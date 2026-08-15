'use client';

import { useState } from 'react';
import { type StreamChoice, streamChoiceOf, streamFlagsOf } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy/admin';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import type { ActionResult, UpdateLessonInput } from '@/app/(admin)/admin/courses/actions';
import { StreamChoiceField } from '@/components/admin/stream-choice';
import { useAutosave } from './autosave';

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

/** What a dependent field holds the moment its mode is chosen. */
const DEFAULT_MIN_VIEW_SECONDS = 0;
const DEFAULT_PASS_GRADE = 60;

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

type Draft = {
  isFreePreview: boolean;
  /** A STRING, so clearing the field to retype it does not read as `0` mid-edit. */
  estimatedSeconds: string;
  mode: CompletionMode;
  minViewSeconds: string;
  passGrade: string;
  stream: StreamChoice;
};

function draftOf(lesson: LessonSettings): Draft {
  return {
    isFreePreview: lesson.isFreePreview,
    estimatedSeconds: String(lesson.estimatedSeconds),
    mode: lesson.completionMode,
    minViewSeconds: String(lesson.completionMinViewSeconds ?? DEFAULT_MIN_VIEW_SECONDS),
    passGrade: String(lesson.completionPassGrade ?? DEFAULT_PASS_GRADE),
    stream: streamChoiceOf(lesson),
  };
}

/** An empty or half-typed number field is 0, never `NaN` — which zod rejects. */
function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function payloadOf(draft: Draft): UpdateLessonInput {
  const needsViewSeconds = draft.mode === 'on_view';
  const needsPassGrade = draft.mode === 'on_grade' || draft.mode === 'on_pass';

  return {
    isFreePreview: draft.isFreePreview,
    estimatedSeconds: toNumber(draft.estimatedSeconds),
    ...streamFlagsOf(draft.stream),
    completionMode: draft.mode,
    completionMinViewSeconds: needsViewSeconds ? toNumber(draft.minViewSeconds) : null,
    completionPassGrade: needsPassGrade ? toNumber(draft.passGrade) : null,
  };
}

/**
 * Free preview, estimated duration, the audience, and the completion rule.
 *
 * ## No «حفظ» button, and no `<form>` — both deliberate
 *
 * This was a `<form action={submit}>` with its own save button, and that shape
 * carried a silent data-loss bug. React 19 calls `form.reset()` when a form
 * action resolves. A CONTROLLED `<select>` has no `selected` attribute for a
 * native reset to restore, so «قاعدة الإتمام» snapped back to its first option
 * — «من غير قاعدة» — after every successful save, while React state still held
 * the real value. The instructor saw the app throw their choice away, and
 * reported exactly that.
 *
 * The damaging half was quieter. The same reset restored the UNCONTROLLED
 * inputs to the original lesson's numbers, so pressing حفظ again — the obvious
 * reaction to seeing the rule reset — wrote the stale estimated duration, free
 * preview flag and pass grade back over the values that had just been saved.
 *
 * Everything here is controlled state now, saved on change. There is no form to
 * reset, no default to fall back to, and no second press to get wrong.
 *
 * ## The coupled pair
 *
 * `LessonUpdateSchema.refine` requires `completionMinViewSeconds` with
 * `on_view`, and `completionPassGrade` with `on_grade`/`on_pass`. So every
 * write sends the mode and its dependent value together — including the write
 * that picking the mode itself triggers, which is why the dependent value has a
 * default rather than starting empty. The values a mode does NOT need are
 * explicitly nulled, so one left over from a previous mode cannot survive as an
 * invisible rule.
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
  const [draft, setDraft] = useState<Draft>(() => draftOf(lesson));
  const { save } = useAutosave<UpdateLessonInput>({ onSave });

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    save(payloadOf(next));
  }

  const needsViewSeconds = draft.mode === 'on_view';
  const needsPassGrade = draft.mode === 'on_grade' || draft.mode === 'on_pass';

  /*
   * Reads the DRAFT, not the stored row. It used to read the saved lesson so
   * the warning would not flash mid-decision, but the audience is three
   * exclusive radios — one click, never a decision held half-made — and under
   * autosave the draft becomes the stored pair a moment later anyway. Reading
   * the stored pair now would mean the warning describes the PREVIOUS choice.
   */
  const flags = streamFlagsOf(draft.stream);
  const overlapsCourse =
    (flags.forGeneral && courseStream?.forGeneral) ||
    (flags.forLanguages && courseStream?.forLanguages);

  return (
    <div className="mt-4 space-y-3 border-t border-line-subtle pt-4">
      <h5 className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.settings}</h5>

      <StreamChoiceField
        idPrefix={`lesson-stream-${lesson.id}`}
        defaults={lesson}
        onChange={(stream) => update({ stream })}
      />
      {courseStream && !overlapsCourse ? (
        <p className="stream-warning" role="status">
          {copy.stream.lessonOutsideCourse}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id={`preview-${lesson.id}`}
            checked={draft.isFreePreview}
            onCheckedChange={(isFreePreview) => update({ isFreePreview })}
          />
          <Label htmlFor={`preview-${lesson.id}`}>{c.freePreview}</Label>
        </div>

        <div className="w-40">
          <Label htmlFor={`est-${lesson.id}`}>{c.estimatedSeconds}</Label>
          <Input
            id={`est-${lesson.id}`}
            type="number"
            min={0}
            max={86400}
            value={draft.estimatedSeconds}
            onChange={(event) => update({ estimatedSeconds: event.target.value })}
          />
        </div>

        <div className="w-52">
          <Label htmlFor={`mode-${lesson.id}`}>{c.completionMode}</Label>
          <Select
            id={`mode-${lesson.id}`}
            value={draft.mode}
            onChange={(event) => update({ mode: event.target.value as CompletionMode })}
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
              type="number"
              min={0}
              value={draft.minViewSeconds}
              onChange={(event) => update({ minViewSeconds: event.target.value })}
            />
          </div>
        ) : null}

        {needsPassGrade ? (
          <div className="w-40">
            <Label htmlFor={`pass-${lesson.id}`}>{c.passGrade}</Label>
            <Input
              id={`pass-${lesson.id}`}
              type="number"
              min={0}
              max={100}
              value={draft.passGrade}
              onChange={(event) => update({ passGrade: event.target.value })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
