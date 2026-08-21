import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES } from './admin/media';
import {
  CourseCreateSchema,
  MAX_RESOURCE_BYTES,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
  LessonCreateSchema,
  LessonResourceInputSchema,
  LessonResourceUpdateSchema,
  ReorderSchema,
  SlugSchema,
} from './content';

const uuid = () => crypto.randomUUID();

const validCourse = () => ({
  slug: 'programming-year-2',
  title: 'البرمجة وعلوم الحاسب — الصف الثاني',
  subtitle: null,
  description: null,
  systemId: uuid(),
  year: 2,
  trackId: uuid(),
  subjectId: uuid(),
  coverKey: null,
});

describe('SlugSchema', () => {
  it.each(['abc', 'programming-year-2', 'a1-b2-c3'])('accepts %s', (value) => {
    expect(SlugSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    'ab',
    'Programming',
    'has space',
    'trailing-',
    '-leading',
    'double--hyphen',
    'برمجة',
    'new',
    'admin',
  ])('rejects %s', (value) => {
    expect(SlugSchema.safeParse(value).success).toBe(false);
  });
});

describe('course emphasis badge', () => {
  it('defaults to no badge and no note', () => {
    const parsed = CourseCreateSchema.parse(validCourse());
    expect(parsed.emphasis).toBeNull();
    expect(parsed.emphasisNote).toBeNull();
  });

  it.each(['required', 'recommended', 'optional'] as const)('accepts %s', (emphasis) => {
    const parsed = CourseCreateSchema.parse({ ...validCourse(), emphasis });
    expect(parsed.emphasis).toBe(emphasis);
  });

  it('accepts a badge with a note', () => {
    const parsed = CourseCreateSchema.parse({
      ...validCourse(),
      emphasis: 'optional',
      emphasisNote: 'أساسي لأولى بكالوريا · اختياري لتانية',
    });
    expect(parsed.emphasisNote).toBe('أساسي لأولى بكالوريا · اختياري لتانية');
  });

  /*
   * The half that matters. `courses_note_needs_emphasis` refuses this row in
   * the database; if the schema let it through, the instructor would meet the
   * constraint as a 500 instead of as a field error — and the note would be a
   * sentence the card has nowhere to put.
   */
  it('rejects a note with no badge', () => {
    const result = CourseCreateSchema.safeParse({
      ...validCourse(),
      emphasisNote: 'أساسي لأولى بكالوريا',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['emphasisNote']);
  });

  it('rejects a note with an explicitly null badge', () => {
    const result = CourseCreateSchema.safeParse({
      ...validCourse(),
      emphasis: null,
      emphasisNote: 'أساسي لأولى بكالوريا',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown badge', () => {
    expect(
      CourseCreateSchema.safeParse({ ...validCourse(), emphasis: 'urgent' }).success,
    ).toBe(false);
  });

  it('rejects a note longer than 80 characters', () => {
    expect(
      CourseCreateSchema.safeParse({
        ...validCourse(),
        emphasis: 'required',
        emphasisNote: 'ا'.repeat(81),
      }).success,
    ).toBe(false);
  });

  /*
   * The update schema carries the same refine, and it has to survive
   * `partialWithoutDefaults` — which strips each field's `.default()` so an
   * absent key stays absent. A note sent alone on a PATCH is still a note with
   * no badge, because the badge it would need is not in the payload.
   */
  it('rejects a note-only PATCH', () => {
    expect(
      CourseUpdateSchema.safeParse({ emphasisNote: 'أساسي لأولى' }).success,
    ).toBe(false);
  });

  it('accepts a PATCH clearing both', () => {
    const parsed = CourseUpdateSchema.parse({ emphasis: null, emphasisNote: null });
    expect(parsed.emphasis).toBeNull();
    expect(parsed.emphasisNote).toBeNull();
  });

  /* A PATCH that sends neither must not manufacture either — the whole point
     of `partialWithoutDefaults`. See [[partial-patch-injected-defaults]]. */
  it('leaves both absent when a PATCH mentions neither', () => {
    const parsed = CourseUpdateSchema.parse({ title: 'اسم جديد' });
    expect('emphasis' in parsed).toBe(false);
    expect('emphasisNote' in parsed).toBe(false);
  });
});

describe('CourseCreateSchema', () => {
  it('accepts a well-formed course', () => {
    expect(CourseCreateSchema.safeParse(validCourse()).success).toBe(true);
  });

  it('rejects a grade-1 course carrying a track', () => {
    const result = CourseCreateSchema.safeParse({ ...validCourse(), year: 1 });
    expect(result.success).toBe(false);
  });

  it('accepts a grade-1 course with no track', () => {
    const result = CourseCreateSchema.safeParse({ ...validCourse(), year: 1, trackId: null });
    expect(result.success).toBe(true);
  });

  it('REJECTS status rather than stripping it — publishing has its own endpoint', () => {
    const result = CourseCreateSchema.safeParse({ ...validCourse(), status: 'published' });
    expect(result.success).toBe(false);
  });

  it('rejects a smuggled instructorId, publishedAt or id', () => {
    for (const extra of [{ instructorId: uuid() }, { publishedAt: new Date().toISOString() }, { id: uuid() }]) {
      expect(CourseCreateSchema.safeParse({ ...validCourse(), ...extra }).success).toBe(false);
    }
  });
});

describe('CourseUpdateSchema', () => {
  it('stays strict after .partial()', () => {
    expect(CourseUpdateSchema.safeParse({ title: 'جديد' }).success).toBe(true);
    expect(CourseUpdateSchema.safeParse({ status: 'published' }).success).toBe(false);
  });
});

describe('CourseStatusPatchSchema', () => {
  it('takes status and nothing else', () => {
    expect(CourseStatusPatchSchema.safeParse({ status: 'published' }).success).toBe(true);
    expect(CourseStatusPatchSchema.safeParse({ status: 'published', title: 'x' }).success).toBe(false);
    expect(CourseStatusPatchSchema.safeParse({ status: 'live' }).success).toBe(false);
  });
});

describe('LessonCreateSchema', () => {
  const base = { title: 'المحاضرة الأولى', kind: 'video' as const };

  it('defaults completionMode to manual and position is not accepted at all', () => {
    const parsed = LessonCreateSchema.parse(base);
    expect(parsed.completionMode).toBe('manual');
    expect(LessonCreateSchema.safeParse({ ...base, position: 0 }).success).toBe(false);
  });

  it.each(['visibleFrom', 'visibleTo', 'unlocksAfterLessonId', 'viewLimit', 'contentGroupId'])(
    'rejects the reserved-but-unenforced field %s instead of silently ignoring it',
    (field) => {
      const payload = { ...base, [field]: field === 'viewLimit' ? 3 : new Date().toISOString() };
      expect(LessonCreateSchema.safeParse(payload).success).toBe(false);
    },
  );

  it('requires a threshold when completion depends on one', () => {
    expect(LessonCreateSchema.safeParse({ ...base, completionMode: 'on_view' }).success).toBe(false);
    expect(
      LessonCreateSchema.safeParse({ ...base, completionMode: 'on_view', completionMinViewSeconds: 60 })
        .success,
    ).toBe(true);
    expect(LessonCreateSchema.safeParse({ ...base, completionMode: 'on_pass' }).success).toBe(false);
    expect(
      LessonCreateSchema.safeParse({ ...base, completionMode: 'on_pass', completionPassGrade: 70 })
        .success,
    ).toBe(true);
  });
});

describe('ReorderSchema', () => {
  it('accepts a full ordered array', () => {
    const ids = Array.from({ length: 40 }, () => uuid());
    expect(ReorderSchema.safeParse({ orderedIds: ids }).success).toBe(true);
  });

  it('rejects duplicates, empties, and anything alongside orderedIds', () => {
    const id = uuid();
    expect(ReorderSchema.safeParse({ orderedIds: [id, id] }).success).toBe(false);
    expect(ReorderSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    expect(ReorderSchema.safeParse({ orderedIds: [id], sectionId: uuid() }).success).toBe(false);
  });

  it('rejects non-uuid entries', () => {
    expect(ReorderSchema.safeParse({ orderedIds: ['1', '2'] }).success).toBe(false);
  });
});

describe('LessonResourceInputSchema', () => {
  const base = { title: 'المحاضرة الأولى', description: null };
  const file = {
    storageKey: 'doc/ab/x.pdf',
    filename: 'lecture-1.pdf',
    mime: 'application/pdf',
    sizeBytes: 2048,
  };

  it('turns a video URL into an 11-character id and discards the URL', () => {
    const parsed = LessonResourceInputSchema.parse({
      ...base,
      kind: 'video',
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30',
    });
    expect(parsed).toMatchObject({
      kind: 'video',
      videoProvider: 'youtube',
      videoExternalId: 'dQw4w9WgXcQ',
    });
    // The whole point of the extractor: no URL survives into the row.
    expect(JSON.stringify(parsed)).not.toContain('youtube.com');
  });

  it('rejects a non-youtube provider while v1 is youtube-only', () => {
    const result = LessonResourceInputSchema.safeParse({
      ...base,
      kind: 'video',
      provider: 'vimeo',
      url: 'https://vimeo.com/123456789',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an http link', () => {
    const result = LessonResourceInputSchema.safeParse({
      ...base,
      kind: 'link',
      linkUrl: 'http://example.com/notes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects javascript: and data: links', () => {
    for (const linkUrl of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      expect(LessonResourceInputSchema.safeParse({ ...base, kind: 'link', linkUrl }).success).toBe(
        false,
      );
    }
  });

  it('accepts an https link and keeps it', () => {
    const parsed = LessonResourceInputSchema.parse({
      ...base,
      kind: 'link',
      linkUrl: 'https://example.com/notes',
    });
    expect(parsed).toMatchObject({ kind: 'link', linkUrl: 'https://example.com/notes' });
    expect(parsed.storageKey).toBeNull();
    expect(parsed.videoExternalId).toBeNull();
  });

  it('rejects a document with no file', () => {
    expect(LessonResourceInputSchema.safeParse({ ...base, kind: 'document' }).success).toBe(false);
  });

  it('rejects a document that also carries a link', () => {
    const result = LessonResourceInputSchema.safeParse({
      ...base,
      kind: 'document',
      ...file,
      linkUrl: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a presentation and nulls every foreign payload', () => {
    const parsed = LessonResourceInputSchema.parse({ ...base, kind: 'presentation', ...file });
    expect(parsed).toMatchObject({ kind: 'presentation', storageKey: 'doc/ab/x.pdf' });
    expect(parsed.linkUrl).toBeNull();
    expect(parsed.videoProvider).toBeNull();
    expect(parsed.videoExternalId).toBeNull();
  });

  it('defaults description to null rather than leaving it undefined', () => {
    const parsed = LessonResourceInputSchema.parse({
      title: 'بدون وصف',
      kind: 'presentation',
      ...file,
    });
    expect(parsed.description).toBeNull();
  });

  it('rejects an unknown key rather than stripping it', () => {
    const result = LessonResourceInputSchema.safeParse({
      ...base,
      kind: 'presentation',
      ...file,
      position: 3,
    });
    expect(result.success).toBe(false);
  });
});

describe('LessonResourceUpdateSchema', () => {
  it('accepts a title-only patch', () => {
    expect(LessonResourceUpdateSchema.safeParse({ title: 'اسم جديد' }).success).toBe(true);
  });

  it('refuses to change kind or payload through a patch', () => {
    expect(LessonResourceUpdateSchema.safeParse({ kind: 'link' }).success).toBe(false);
    expect(LessonResourceUpdateSchema.safeParse({ storageKey: 'doc/ab/x.pdf' }).success).toBe(false);
  });
});

describe('upload caps stay under the Cloudflare edge limit', () => {
  // Cloudflare rejects bodies over 100 MB on Free AND Pro with a 413 raised at
  // the edge — before the request reaches the origin, so it leaves no trace in
  // any server log. These caps exist to make the refusal come from US instead.
  const CLOUDFLARE_FREE_LIMIT = 100 * 1024 * 1024;

  it('keeps the document cap below the edge limit, with multipart headroom', () => {
    expect(MAX_DOCUMENT_BYTES).toBeLessThan(CLOUDFLARE_FREE_LIMIT);
    // The multipart envelope makes the body bigger than the file; a cap at
    // exactly the edge limit would still be rejected on the wire.
    expect(CLOUDFLARE_FREE_LIMIT - MAX_DOCUMENT_BYTES).toBeGreaterThanOrEqual(4 * 1024 * 1024);
  });

  it('keeps the resource cap and the upload cap identical', () => {
    // A gap either way lets a file pass one gate and fail the other, and the
    // failure reads as a bug in whichever half ran second.
    expect(MAX_RESOURCE_BYTES).toBe(MAX_DOCUMENT_BYTES);
  });
});
