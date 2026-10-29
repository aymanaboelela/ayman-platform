import { describe, expect, it } from 'vitest';
import { youtubeDescriptionCopy, youtubeStudioCopy } from '../copy/youtube-studio';
import {
  YoutubeVideoUpdateSchema,
  hasChapters,
  masculineWords,
  youtubeCourseLink,
  youtubeTagsLength,
  youtubeVideoFlags,
} from './studio';

describe('youtube studio contracts', () => {
  it('counts tags the way YouTube does — commas, and quotes around a tag with a space', () => {
    expect(youtubeTagsLength([])).toBe(0);
    expect(youtubeTagsLength(['abc'])).toBe(3);
    expect(youtubeTagsLength(['abc', 'de f'])).toBe(3 + 1 + 4 + 2);
  });

  it('tags the course link for the video, keeping the course path', () => {
    expect(youtubeCourseLink('https://teacher.example/courses/prog-y2', 'dQw4w9WgXcQ')).toBe(
      'https://teacher.example/courses/prog-y2?utm_source=youtube&utm_medium=description&utm_campaign=dQw4w9WgXcQ',
    );
  });

  it('flags a weak video', () => {
    expect(youtubeVideoFlags({ description: '', tags: [] }, 'www.teacher.example')).toEqual([
      'noDescription',
      'noSiteLink',
      'noTags',
      'noChapters',
    ]);
    const good = `${'شرح كامل للدرس '.repeat(4)}\nhttps://teacher.example/courses/x\n00:00 مقدمة\n01:10 الجزء الأول\n05:00 أسئلة`;
    expect(youtubeVideoFlags({ description: good, tags: ['x'] }, 'teacher.example')).toEqual([]);
  });

  it('knows chapters only when YouTube would show them', () => {
    expect(hasChapters('00:00 a\n01:00 b\n02:00 c')).toBe(true);
    expect(hasChapters('0:00 a\n1:00 b\n2:00 c')).toBe(true);
    expect(hasChapters('00:10 a\n01:00 b\n02:00 c')).toBe(false);
    expect(hasChapters('00:00 a\n01:00 b')).toBe(false);
  });

  it('an update with no field is a no-op, and absent fields stay absent (no injected defaults)', () => {
    expect(YoutubeVideoUpdateSchema.parse({})).toEqual({});
    expect(YoutubeVideoUpdateSchema.parse({ title: 'x' })).toEqual({ title: 'x' });
    expect(YoutubeVideoUpdateSchema.safeParse({ title: 'a'.repeat(101) }).success).toBe(false);
    expect(YoutubeVideoUpdateSchema.safeParse({ title: '<b>' }).success).toBe(false);
    expect(YoutubeVideoUpdateSchema.safeParse({ tags: Array.from({ length: 60 }, () => 'abcdefghij') }).success).toBe(false);
    expect(YoutubeVideoUpdateSchema.safeParse({ privacy: 'public' }).success).toBe(false);
  });

  it('finds masculine address', () => {
    expect(masculineWords('اشترك في القناة وشوف الفيديو')).toEqual(['اشترك']);
    expect(masculineWords('اشتركوا في القناة')).toEqual([]);
  });
});

/** The screen's own copy never addresses one reader in the masculine either. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    try {
      strings(fn(3, 5), out);
    } catch {
      strings(fn(['كلمة']), out);
    }
  }
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

describe('the youtube studio voice', () => {
  it('never addresses one reader in the masculine', () => {
    for (const line of [...strings(youtubeStudioCopy), ...strings(youtubeDescriptionCopy)]) {
      expect(masculineWords(line), line).toEqual([]);
    }
  });
});
