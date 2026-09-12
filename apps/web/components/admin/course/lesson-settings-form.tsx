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
  /** ISO with an offset, or null for "no schedule". */
  publishAt?: string | null;
  description?: string | null;
  /** So the schedule field can say the lecture is already live and the
   *  schedule therefore does nothing. */
  isPublished?: boolean;
}

type Draft = {
  isFreePreview: boolean;
  /** A STRING, so clearing the field to retype it does not read as `0` mid-edit. */
  estimatedSeconds: string;
  mode: CompletionMode;
  minViewSeconds: string;
  passGrade: string;
  stream: StreamChoice;
  /** `datetime-local`'s own format — `2026-09-12T20:00`, no zone. See
   *  `toInstant` for why that is not what gets sent. */
  publishAt: string;
  description: string;
};

/*
 * ## The timezone, which is the whole difficulty of this field
 *
 * `<input type="datetime-local">` hands back `2026-09-12T20:00` with no zone
 * at all. Sending that string as-is is the bug: every ISO parser on the way to
 * the database reads a zoneless timestamp as UTC, so «٨ مساءً» is stored as
 * 20:00Z and the lecture appears at 11pm Cairo — wrong by exactly the offset,
 * silently, and only visible on the night it matters.
 *
 * `new Date('2026-09-12T20:00')` parses a zoneless string as LOCAL time, which
 * is the instructor's own clock and therefore the right reading. `toISOString`
 * then names that instant unambiguously. The pair is what makes "8pm" mean 8pm
 * — and keep meaning it after Egypt's DST change in October, because an
 * instant does not drift.
 */
function toInstant(local: string): string | null {
  if (!local) return null;
  const parsed = new Date(local);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** The inverse: an instant from the server, rendered in the admin's own clock
 *  so the box shows the time they typed rather than its UTC equivalent. */
function toLocalInput(instant: string | null | undefined): string {
  if (!instant) return '';
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` +
    `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  );
}

function draftOf(lesson: LessonSettings): Draft {
  return {
    isFreePreview: lesson.isFreePreview,
    estimatedSeconds: String(lesson.estimatedSeconds),
    mode: lesson.completionMode,
    minViewSeconds: String(lesson.completionMinViewSeconds ?? DEFAULT_MIN_VIEW_SECONDS),
    passGrade: String(lesson.completionPassGrade ?? DEFAULT_PASS_GRADE),
    stream: streamChoiceOf(lesson),
    publishAt: toLocalInput(lesson.publishAt),
    description: lesson.description ?? '',
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
    publishAt: toInstant(draft.publishAt),
    // Empty box means "no summary", which is a null and not an empty string:
    // the student UI shows the panel when there is a description at all, and
    // `''` would render an empty disclosure on every lecture without one.
    description: draft.description.trim() === '' ? null : draft.description,
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

      {/*
        «ينزل الساعة ٨». First in the panel, above the audience and the
        completion rule, because it is the one setting with a deadline attached
        — an instructor opens this panel at 7:50pm to check it, not to review
        the pass grade.
      */}
      <div className="space-y-1">
        <Label htmlFor={`publish-at-${lesson.id}`}>{c.publishAt}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`publish-at-${lesson.id}`}
            type="datetime-local"
            className="w-60"
            value={draft.publishAt}
            onChange={(event) => update({ publishAt: event.target.value })}
          />
          {draft.publishAt ? (
            <button
              type="button"
              className="chip chip--quiet"
              onClick={() => update({ publishAt: '' })}
            >
              {c.publishAtClear}
            </button>
          ) : null}
        </div>
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {/*
            Three different sentences, because the field means three different
            things depending on the lecture's state — and the one that matters
            most is the third: a schedule on an already-published lecture is a
            control that will never fire, and saying so is cheaper than the
            evening spent wondering why nothing happened.
          */}
          {lesson.isPublished
            ? c.publishAtAlreadyLive
            : draft.publishAt
              ? c.publishAtHint
              : c.publishAtEmpty}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`description-${lesson.id}`}>{c.description}</Label>
        <textarea
          id={`description-${lesson.id}`}
          rows={4}
          maxLength={2000}
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          className="w-full rounded-lg border border-line bg-surface-2 p-2.5 text-[length:var(--fs-text-sm)] text-fg"
        />
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.descriptionHint}</p>
      </div>

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
