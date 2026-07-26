import { describe, expect, it } from 'vitest';
import {
  CourseCreateSchema,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
  LessonCreateSchema,
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
