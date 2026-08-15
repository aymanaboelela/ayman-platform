'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { type StreamChoice, streamChoiceOf } from '@ayman/contracts/content';
import type { Taxonomy } from '@ayman/contracts/taxonomy';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { StreamChoiceField } from '@/components/admin/stream-choice';
import { useAutosave } from '@/components/admin/course/autosave';

export type CourseDefaults = {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  systemId: string;
  year: number;
  trackId: string | null;
  subjectId: string;
  coverKey: string | null;
  forGeneral: boolean;
  forLanguages: boolean;
  requiresGrant: boolean;
};

type Props = {
  taxonomy: Taxonomy;
  defaults?: CourseDefaults;
  /**
   * A React `<form action>` only cares that this is callable with `FormData`
   * — accepts both the redirecting create action (returns `void`) and the
   * `ActionResult`-returning update action.
   */
  action: (formData: FormData) => unknown;
  /**
   * `create` keeps an explicit «إضافة» button: there is no course to save into
   * until it is pressed, so autosaving is not merely unnecessary, it is
   * impossible. `edit` has no button at all — every field writes itself.
   */
  mode?: 'create' | 'edit';
};

type Draft = {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  systemId: string;
  year: number;
  trackId: string;
  subjectId: string;
  coverKey: string | null;
  stream: StreamChoice;
  requiresGrant: boolean;
};

/**
 * ONE builder for both paths, so the create form and the autosaving editor
 * cannot disagree about what a course payload contains. The keys are the ones
 * `createCourseAction`/`updateCourseAction` read out of `FormData`.
 */
function formDataOf(draft: Draft): FormData {
  const data = new FormData();
  data.set('title', draft.title);
  data.set('slug', draft.slug);
  data.set('subtitle', draft.subtitle);
  data.set('description', draft.description);
  data.set('systemId', draft.systemId);
  data.set('year', String(draft.year));
  // Year 1 has no track, and `readTrackId` turns '' into null — which is what
  // the year-1 CHECK constraint requires.
  data.set('trackId', draft.year === 1 ? '' : draft.trackId);
  data.set('subjectId', draft.subjectId);
  data.set('coverKey', draft.coverKey ?? '');
  data.set('stream', draft.stream);
  // The hidden-false convention `readRequiresGrant` expects: an unchecked box
  // submits nothing on a real form, so the pair has to be explicit here.
  data.set('requiresGrant', draft.requiresGrant ? 'true' : 'false');
  return data;
}

/**
 * The course's own fields — title, slug, taxonomy, cover, access.
 *
 * ## Two modes, and why the edit one has no «حفظ»
 *
 * This form used to be a `<form action>` with a save button in both places,
 * and in the editor that shape carried the same silent defect as the lesson
 * settings panel. React 19 resets a form once its action resolves: the three
 * controlled `<select>`s here (system, year, track) have no `selected`
 * attribute for a native reset to restore, so they fell back to their first
 * option, and every uncontrolled field snapped back to the `defaults` captured
 * on the FIRST render — not to what had just been saved. Pressing حفظ a second
 * time then wrote those stale values over the good ones.
 *
 * The editor now holds one draft and writes it on change. Nothing to reset,
 * nothing to press twice.
 */
export function CourseForm({ taxonomy, defaults, action, mode = 'create' }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({
    title: defaults?.title ?? '',
    slug: defaults?.slug ?? '',
    subtitle: defaults?.subtitle ?? '',
    description: defaults?.description ?? '',
    systemId: defaults?.systemId ?? taxonomy.systems[0]?.id ?? '',
    year: defaults?.year ?? 2,
    trackId: defaults?.trackId ?? '',
    subjectId: defaults?.subjectId ?? '',
    coverKey: defaults?.coverKey ?? null,
    stream: streamChoiceOf(defaults ?? { forGeneral: true, forLanguages: true }),
    requiresGrant: defaults?.requiresGrant ?? false,
  }));
  const [saving, setSaving] = useState(false);

  const { save } = useAutosave<FormData>({
    onSave: async (formData) => {
      const result = await action(formData);
      if (result && typeof result === 'object' && 'ok' in result) {
        return result as { ok: true } | { ok: false; message: string };
      }
      return { ok: true };
    },
    // The slug is re-checked for a collision on every write, so this waits a
    // little longer than a lesson field does.
    delayMs: 900,
  });

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    // A course with no title or slug cannot be PATCHed — `CourseUpdateSchema`
    // requires both to be non-empty — and a half-cleared field on the way to a
    // new value is not a request to save nothing.
    if (mode === 'edit' && next.title.length > 0 && next.slug.length > 0) {
      save(formDataOf(next));
    }
  }

  const system = taxonomy.systems.find((candidate) => candidate.id === draft.systemId);
  // Grade 1 is common and non-specialized in BOTH systems, so the field is
  // HIDDEN — not disabled — and no value is submitted for it at all. A
  // disabled field with a stale value is exactly how a year-1 course
  // acquires a track.
  const showTrack = draft.year !== 1;
  const track = system?.tracks.find((candidate) => candidate.id === draft.trackId);

  /**
   * The taxonomy contract only exposes subjects that are members of an
   * elective group for the selected track and year — that is every subject
   * this single-subject-per-course platform currently needs a picker for.
   * `subjectId` here is `Subject.id` (not the offering id `option.id`),
   * exactly what `Course.subjectId` requires.
   */
  const subjects = (track?.electiveGroups ?? [])
    .filter((group) => group.year === draft.year)
    .flatMap((group) => group.options)
    .map((option) => ({ id: option.subjectId, nameAr: option.nameAr }));

  const fields = (
    <>
      <div>
        <Label htmlFor="title" required>
          {copy.admin.course.title}
        </Label>
        <Input
          id="title"
          name="title"
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="slug" required>
          {copy.admin.course.slug}
        </Label>
        <Input
          id="slug"
          name="slug"
          dir="ltr"
          value={draft.slug}
          onChange={(event) => update({ slug: event.target.value })}
          required
        />
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.admin.course.slugHint}
        </p>
      </div>

      <div>
        <Label htmlFor="subtitle">{copy.admin.course.subtitle}</Label>
        <Input
          id="subtitle"
          name="subtitle"
          value={draft.subtitle}
          onChange={(event) => update({ subtitle: event.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="description">{copy.admin.course.description}</Label>
        <Textarea
          id="description"
          name="description"
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="systemId" required>
            {copy.admin.course.system}
          </Label>
          <Select
            id="systemId"
            name="systemId"
            value={draft.systemId}
            onChange={(event) => update({ systemId: event.target.value, trackId: '' })}
          >
            {taxonomy.systems.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nameAr}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="year" required>
            {copy.admin.course.year}
          </Label>
          <Select
            id="year"
            name="year"
            value={String(draft.year)}
            onChange={(event) => update({ year: Number(event.target.value) })}
          >
            {(system?.years ?? []).map((option) => (
              <option key={option.year} value={String(option.year)}>
                {option.labelAr}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {showTrack ? (
        <div>
          <Label htmlFor="trackId">{copy.admin.course.track}</Label>
          <Select
            id="trackId"
            name="trackId"
            value={draft.trackId}
            onChange={(event) => update({ trackId: event.target.value })}
          >
            <option value="">—</option>
            {(system?.tracks ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.labelAr}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.admin.course.trackNoneYear1}
        </p>
      )}

      <div>
        <Label htmlFor="subjectId" required>
          {copy.admin.course.subject}
        </Label>
        {subjects.length === 0 ? (
          <>
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.admin.course.subjectEmpty}
            </p>
            {/*
              The course KEEPS the subject it already has.

              Without this the field simply vanished from the submission, and
              `CourseUpdateSchema` requires a uuid — so a course whose track is
              unset (its subject list is derived from the track) could not be
              saved AT ALL. Every press of «حفظ» 400'd, and since the result was
              being discarded, the screen said nothing: the admin changed the
              cover, saved, and got the old cover back. Found while verifying
              the upload fix on exactly such a course.

              A hidden input rather than "send nothing and let the API keep the
              old value": the schema is `.partial()`, so an absent key does mean
              "leave it alone" — but `year`/`trackId` are re-validated as a
              TUPLE against the offering table on every update, and the tuple
              needs the subject to be checked at all.
            */}
            {draft.subjectId ? (
              <input type="hidden" name="subjectId" value={draft.subjectId} />
            ) : null}
          </>
        ) : (
          <Select
            id="subjectId"
            name="subjectId"
            value={draft.subjectId}
            onChange={(event) => update({ subjectId: event.target.value })}
          >
            {/*
              The course's CURRENT subject, when the picker's own list does not
              contain it — a track change, or a taxonomy edit after the course
              was created. Without this option the `value` would match nothing
              and the browser would show the first subject in the list, so
              editing the title alone would quietly move the course.
            */}
            {draft.subjectId && !subjects.some((option) => option.id === draft.subjectId) ? (
              <option value={draft.subjectId}>{copy.admin.course.subjectCurrent}</option>
            ) : null}
            {subjects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nameAr}
              </option>
            ))}
          </Select>
        )}
      </div>

      <StreamChoiceField
        idPrefix="course-stream"
        defaults={defaults}
        onChange={(stream) => update({ stream })}
      />

      <MediaKeyField
        name="coverKey"
        id="course-cover"
        label={copy.admin.course.cover}
        hint={copy.admin.course.coverHint}
        defaultValue={defaults?.coverKey ?? null}
        onChange={(coverKey) => update({ coverKey })}
      />

      {/*
        Free or closed.

        A CHECKBOX rather than a two-option switch, because the two states are
        not peers: every course is open, and closing one is the exception an
        instructor deliberately reaches for. `value="true"` with the hidden
        `false` beside it is this admin's convention for a boolean read out of
        `FormData` — an unchecked box submits nothing at all, and a missing key
        on the update endpoint means "leave it alone", not "set it false".
      */}
      <div>
        <input type="hidden" name="requiresGrant" value="false" />
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="requiresGrant"
            value="true"
            checked={draft.requiresGrant}
            onChange={(event) => update({ requiresGrant: event.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="block text-fg">{copy.admin.course.requiresGrant}</span>
            <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">
              {copy.admin.course.requiresGrantHint}
            </span>
          </span>
        </label>
      </div>
    </>
  );

  if (mode === 'edit') {
    // No `<form>` at all. There is nothing to submit, and a form with no
    // submit control is one stray Enter key away from a full page reload.
    return <div className="max-w-[var(--w-prose)] space-y-5">{fields}</div>;
  }

  return (
    <form
      /*
        `action`, NOT a hand-rolled `onSubmit` — and this is a conclusion the
        e2e reached twice, in opposite directions, so it is worth stating.
        `createCourseAction` ends in `redirect()`, which is a signal only
        React's own action runtime knows how to turn into a navigation. Called
        from a detached promise it becomes an unhandled rejection and the admin
        sits on the create form with the course already created; called inside
        `startTransition` it reached the error boundary instead («الصفحة وقعت»).
        A form action is the shape that handles it, and it is the shape that
        was here.

        The reset that a form action performs afterwards is the defect this
        file's header describes — but it cannot bite HERE. `createCourseAction`
        THROWS on a rejected payload rather than returning a result, so a failed
        create leaves for the error boundary and never comes back to a reset
        form; a successful one redirects away. The reset only had teeth in the
        editor, where the form stayed mounted and was pressed twice, and the
        editor has no form at all now.

        `formData` comes from the DOM rather than from `formDataOf(draft)`
        because every field below carries its `name` — the two agree, and using
        the browser's own is one fewer thing to keep in step.

        The result is READ. It used to be `void action(formData)`, so a save
        that failed looked exactly like one that worked.
      */
      action={async (formData) => {
        setSaving(true);
        const result = await action(formData);
        setSaving(false);
        if (result && typeof result === 'object' && 'ok' in result) {
          const outcome = result as { ok: boolean; message?: string };
          if (outcome.ok) toast.success(copy.admin.common.saved);
          else toast.error(outcome.message || copy.admin.common.saveFailed);
        }
      }}
      className="max-w-[var(--w-prose)] space-y-5"
    >
      {fields}
      <Button type="submit" disabled={saving}>
        {saving ? copy.admin.common.saving : copy.admin.common.save}
      </Button>
    </form>
  );
}
