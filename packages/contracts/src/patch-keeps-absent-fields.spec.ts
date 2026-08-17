import { describe, expect, it } from 'vitest';
import { CourseUpdateSchema, LessonUpdateSchema, SectionUpdateSchema } from './content';
import { SubjectOfferingPatchSchema } from './admin/taxonomy';

/**
 * A PATCH must carry ONLY what the caller sent.
 *
 * `.partial()` makes every key optional — but it does NOT remove the
 * `.default()` each key carries for the CREATE schema, and Zod applies a
 * default whenever the key is absent. So every "partial" update silently
 * arrived at the service with a full set of defaults filled in, and the service
 * wrote them.
 *
 * This is not theoretical. Renaming a lecture in the admin sends exactly
 * `{ title }` (see `LessonTitleField` in `lesson-panel.tsx`), which parsed to
 * `{ title, isPublished: false, isFreePreview: false, estimatedSeconds: 0,
 * completionMode: 'manual', … }` — so **renaming a published lecture
 * unpublished it**. It happened on production on 2026-08-17 while renaming
 * «المحاضرة الأولى» to «المحاضرة الثانية»: the rename landed and the lecture
 * vanished from the course.
 *
 * The mirror image is worse because it is silent: `setLessonPublishedAction`
 * sends only `{ isPublished }`, so pressing «نشر» on a lecture reset its
 * free-preview flag, its estimated duration, its completion rule, AND its
 * stream targeting — `forGeneral`/`forLanguages` both default to `true`, so
 * publishing a «عام»-only lecture quietly exposed it to لغات as well.
 *
 * Every one of these schemas is asserted, not just the one that bit, because
 * the defect is in the SHAPE of `.partial()` and not in any single schema.
 */
const CASES = [
  ['LessonUpdateSchema', LessonUpdateSchema, { title: 'عنوان جديد' }],
  ['SectionUpdateSchema', SectionUpdateSchema, { title: 'عنوان جديد' }],
  ['CourseUpdateSchema', CourseUpdateSchema, { title: 'عنوان جديد' }],
  ['SubjectOfferingPatchSchema', SubjectOfferingPatchSchema, {}],
] as const;

describe('a partial update parses to exactly what was sent', () => {
  it.each(CASES)('%s', (_name, schema, input) => {
    const parsed = schema.parse(input) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(input).sort());
  });
});

describe('the create schemas still fill their defaults', () => {
  // The defaults are not wrong, they are just wrong on a PATCH. Removing them
  // from CREATE would be the opposite bug, so both halves are pinned.
  it('a new lesson still arrives unpublished, manual, and serving both streams', () => {
    const parsed = LessonUpdateSchema.parse({ title: 'عنوان', isPublished: true });
    expect(parsed).toEqual({ title: 'عنوان', isPublished: true });
  });

  it('keeps a value the caller sent even when it equals the default', () => {
    // `false` is the default for `isPublished`, so a naive "strip anything that
    // matches the default" fix would drop an explicit unpublish.
    const parsed = LessonUpdateSchema.parse({ isPublished: false });
    expect(parsed).toEqual({ isPublished: false });
  });

  it('still validates the values it is given', () => {
    expect(() => LessonUpdateSchema.parse({ title: 'x' })).toThrow();
    expect(() => LessonUpdateSchema.parse({ nope: 1 })).toThrow();
  });

  it('still applies the coupled completion-rule refinement', () => {
    // `on_view` without `completionMinViewSeconds` must stay a 400 — the
    // refinement reads fields that are now genuinely absent rather than
    // default-filled, so it has to keep firing.
    expect(() => LessonUpdateSchema.parse({ completionMode: 'on_view' })).toThrow();
  });
});
