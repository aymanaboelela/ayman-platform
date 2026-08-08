'use client';

import { useState } from 'react';
import type { Taxonomy } from '@ayman/contracts';
import { copy } from '@ayman/contracts';
import { Button, Input, Label, Select, Textarea } from '@ayman/ui';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { StreamChoiceField } from '@/components/admin/stream-choice';

type Props = {
  taxonomy: Taxonomy;
  defaults?: {
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
  /**
   * A React `<form action>` only cares that this is callable with `FormData`
   * — accepts both the redirecting create action (returns `void`) and the
   * `ActionResult`-returning update action.
   */
  action: (formData: FormData) => unknown;
};

export function CourseForm({ taxonomy, defaults, action }: Props) {
  const [systemId, setSystemId] = useState(defaults?.systemId ?? taxonomy.systems[0]?.id ?? '');
  const [year, setYear] = useState(defaults?.year ?? 2);
  const [trackId, setTrackId] = useState(defaults?.trackId ?? '');

  const system = taxonomy.systems.find((candidate) => candidate.id === systemId);
  // Grade 1 is common and non-specialized in BOTH systems, so the field is
  // HIDDEN — not disabled — and no value is submitted for it at all. A
  // disabled field with a stale value is exactly how a year-1 course
  // acquires a track.
  const showTrack = year !== 1;
  const track = system?.tracks.find((candidate) => candidate.id === trackId);

  /**
   * The taxonomy contract only exposes subjects that are members of an
   * elective group for the selected track and year — that is every subject
   * this single-subject-per-course platform currently needs a picker for.
   * `subjectId` here is `Subject.id` (not the offering id `option.id`),
   * exactly what `Course.subjectId` requires.
   */
  const subjects = (track?.electiveGroups ?? [])
    .filter((group) => group.year === year)
    .flatMap((group) => group.options)
    .map((option) => ({ id: option.subjectId, nameAr: option.nameAr }));

  return (
    <form
      action={(formData) => {
        void action(formData);
      }}
      className="max-w-[var(--w-prose)] space-y-5"
    >
      <div>
        <Label htmlFor="title" required>
          {copy.admin.course.title}
        </Label>
        <Input id="title" name="title" defaultValue={defaults?.title} required />
      </div>

      <div>
        <Label htmlFor="slug" required>
          {copy.admin.course.slug}
        </Label>
        <Input id="slug" name="slug" defaultValue={defaults?.slug} dir="ltr" required />
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.admin.course.slugHint}
        </p>
      </div>

      <div>
        <Label htmlFor="subtitle">{copy.admin.course.subtitle}</Label>
        <Input id="subtitle" name="subtitle" defaultValue={defaults?.subtitle ?? ''} />
      </div>

      <div>
        <Label htmlFor="description">{copy.admin.course.description}</Label>
        <Textarea id="description" name="description" defaultValue={defaults?.description ?? ''} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="systemId" required>
            {copy.admin.course.system}
          </Label>
          <Select
            id="systemId"
            name="systemId"
            value={systemId}
            onChange={(event) => {
              setSystemId(event.target.value);
              setTrackId('');
            }}
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
            value={String(year)}
            onChange={(event) => setYear(Number(event.target.value))}
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
            value={trackId}
            onChange={(event) => setTrackId(event.target.value)}
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
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {copy.admin.course.subjectEmpty}
          </p>
        ) : (
          <Select id="subjectId" name="subjectId" defaultValue={defaults?.subjectId} key={trackId}>
            {subjects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nameAr}
              </option>
            ))}
          </Select>
        )}
      </div>

      <StreamChoiceField idPrefix="course-stream" defaults={defaults} />

      <MediaKeyField
        name="coverKey"
        id="course-cover"
        label={copy.admin.course.cover}
        hint={copy.admin.course.coverHint}
        defaultValue={defaults?.coverKey ?? null}
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
            defaultChecked={defaults?.requiresGrant ?? false}
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

      <Button type="submit">{copy.admin.common.save}</Button>
    </form>
  );
}
