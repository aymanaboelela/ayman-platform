import { describe, expect, it } from 'vitest';
import type { YoutubeVideoRow } from '@ayman/contracts/youtube/studio';
import { channelHealth, checklist } from './health';

const row = (over: Partial<YoutubeVideoRow> = {}): YoutubeVideoRow => ({
  id: 'dQw4w9WgXcQ',
  title: 'شرح المصفوفات للصف التاني الثانوي',
  thumbnailUrl: null,
  privacy: 'public',
  views: 1,
  likes: 1,
  publishedAt: null,
  flags: [],
  categoryId: '27',
  isNew: false,
  thumbnailSetHere: false,
  ...over,
});

describe('channelHealth', () => {
  it('is null with nothing loaded', () => {
    expect(channelHealth([])).toMatchObject({ score: null, grade: null, basis: 0 });
  });

  it('counts each missing thing and scores the share that passes', () => {
    const health = channelHealth([
      row(),
      row({ flags: ['noDescription', 'noSiteLink', 'noTags', 'noChapters'], categoryId: '22' }),
    ]);
    expect(health.counts).toEqual({ noDescription: 1, noSiteLink: 1, noTags: 1, noChapters: 1 });
    expect(health.score).toBe(50);
    expect(health.grade).toBe('weak');
    expect(channelHealth([row()]).grade).toBe('great');
  });
});

describe('checklist', () => {
  it('marks a raw upload and never claims a thumbnail it cannot see', () => {
    expect(checklist(row({ title: 'VID_2026.mp4', flags: ['noDescription', 'noTags'], categoryId: '22' }))).toEqual({
      title: 'missing',
      description: 'missing',
      courseLink: 'ok',
      chapters: 'ok',
      tags: 'missing',
      thumbnail: 'unknown',
      category: 'missing',
    });
    expect(checklist(row({ thumbnailSetHere: true })).thumbnail).toBe('ok');
  });
});
