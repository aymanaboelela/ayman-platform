'use client';

import { useId } from 'react';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import { PracticeLessonCodeSchema, type PracticeTrack, type PracticeYear } from '@ayman/contracts/practice';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';

/**
 * The set's own fields — shared by «إضافة درس» and the editor's «بيانات
 * الدرس», so the two cannot drift on a hint or a limit.
 */
export interface SetMetaValue {
  year: PracticeYear;
  track: PracticeTrack;
  lessonCode: string;
  title: string;
  unitTitle: string;
  articleSlug: string;
}

export type SetMetaErrors = Partial<Record<'lessonCode' | 'title', string>>;

export function checkSetMeta(value: SetMetaValue): SetMetaErrors {
  const errors: SetMetaErrors = {};
  if (!PracticeLessonCodeSchema.safeParse(value.lessonCode).success) errors.lessonCode = c.errors.lessonCode;
  if (value.title.trim().length < 2) errors.title = c.errors.lessonTitle;
  return errors;
}

/** '' is «none» in a form field; the wire wants null. */
export const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

export function SetMetaFields({
  value,
  onChange,
  errors,
  compact = false,
}: {
  value: SetMetaValue;
  onChange: (next: SetMetaValue) => void;
  errors: SetMetaErrors;
  /** The editor's side column: one field per row. */
  compact?: boolean;
}) {
  const id = useId();
  const set = <K extends keyof SetMetaValue>(key: K, next: SetMetaValue[K]) => onChange({ ...value, [key]: next });
  const grid = compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2';

  return (
    <div className="flex flex-col gap-4">
      <div className={compact ? 'grid grid-cols-2 gap-3' : 'grid gap-3 sm:grid-cols-3'}>
        <div>
          <Label htmlFor={`${id}-year`}>{c.create.year}</Label>
          <Select
            id={`${id}-year`}
            value={String(value.year)}
            onChange={(event) => set('year', event.target.value === '1' ? 1 : 2)}
          >
            <option value="1">{c.years[1]}</option>
            <option value="2">{c.years[2]}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-track`}>{c.create.track}</Label>
          <Select
            id={`${id}-track`}
            value={value.track}
            onChange={(event) => set('track', event.target.value === 'languages' ? 'languages' : 'arabic')}
          >
            <option value="arabic">{c.tracks.arabic}</option>
            <option value="languages">{c.tracks.languages}</option>
          </Select>
        </div>
        <div className={compact ? 'col-span-2' : undefined}>
          <Label htmlFor={`${id}-code`}>{c.create.lessonCode}</Label>
          <Input
            id={`${id}-code`}
            value={value.lessonCode}
            onChange={(event) => set('lessonCode', event.target.value)}
            placeholder="2-1"
            inputMode="numeric"
            maxLength={5}
            dir="ltr"
            className="font-mono"
            aria-invalid={errors.lessonCode ? true : undefined}
          />
        </div>
      </div>
      <p className="prx-hint -mt-2">{c.create.lessonCodeHint}</p>
      {errors.lessonCode ? (
        <p role="alert" className="prx-error -mt-2">
          {errors.lessonCode}
        </p>
      ) : null}

      <div>
        <Label htmlFor={`${id}-title`}>{c.create.lessonTitle}</Label>
        <Input
          id={`${id}-title`}
          value={value.title}
          onChange={(event) => set('title', event.target.value)}
          maxLength={200}
          dir="auto"
          aria-invalid={errors.title ? true : undefined}
        />
        <p className="prx-hint mt-1">{c.create.lessonTitleHint}</p>
        {errors.title ? (
          <p role="alert" className="prx-error mt-1">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div className={grid}>
        <div>
          <Label htmlFor={`${id}-unit`}>{c.create.unitTitle}</Label>
          <Input
            id={`${id}-unit`}
            value={value.unitTitle}
            onChange={(event) => set('unitTitle', event.target.value)}
            maxLength={200}
            dir="auto"
          />
          <p className="prx-hint mt-1">{c.create.unitTitleHint}</p>
        </div>
        <div>
          <Label htmlFor={`${id}-article`}>{c.create.articleSlug}</Label>
          <Input
            id={`${id}-article`}
            value={value.articleSlug}
            onChange={(event) => set('articleSlug', event.target.value)}
            maxLength={120}
            dir="auto"
          />
          <p className="prx-hint mt-1">{c.create.articleSlugHint}</p>
        </div>
      </div>
    </div>
  );
}
