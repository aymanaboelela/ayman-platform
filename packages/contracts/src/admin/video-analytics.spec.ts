import { describe, expect, it } from 'vitest';
import {
  RETENTION_STEPS,
  VIDEO_PERIODS,
  VIDEO_PERIOD_DAYS,
  VideoAnalyticsDetailSchema,
  parseVideoKey,
  videoKeyOf,
} from './video-analytics';

const UPLOAD = '0123456789abcdef0123456789abcdef';

describe('video keys', () => {
  it('round-trips both shapes the database can hold', () => {
    expect(parseVideoKey(videoKeyOf('upload', UPLOAD))).toEqual({ provider: 'upload', externalId: UPLOAD });
    expect(parseVideoKey(videoKeyOf('youtube', 'dQw4w9WgXcQ'))).toEqual({
      provider: 'youtube',
      externalId: 'dQw4w9WgXcQ',
    });
  });

  it('splits at the FIRST dash, so a YouTube id that carries one survives', () => {
    // `-` is legal inside a YouTube id; only the provider side is dash-free.
    expect(parseVideoKey('youtube-ab-cd_ef-gh')).toEqual({ provider: 'youtube', externalId: 'ab-cd_ef-gh' });
  });

  it('keeps the providers nothing writes yet reachable, as long as the id is URL-safe', () => {
    expect(parseVideoKey('vimeo-76979871')).toEqual({ provider: 'vimeo', externalId: '76979871' });
    expect(parseVideoKey('vimeo-a/b')).toBeNull();
  });

  it('refuses anything that could not name a stored video', () => {
    for (const key of [
      '',
      'upload',
      '-dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
      'netflix-dQw4w9WgXcQ',
      'upload-not-hex',
      'youtube-short',
      `upload-${UPLOAD}.m3u8`,
      'youtube-dQw4w9WgXcQ/../x',
    ]) {
      expect(parseVideoKey(key), key).toBeNull();
    }
  });
});

describe('periods', () => {
  it('every period has a length, and only «all» is open-ended', () => {
    for (const period of VIDEO_PERIODS) {
      expect(VIDEO_PERIOD_DAYS[period] === null).toBe(period === 'all');
    }
  });
});

describe('the detail contract', () => {
  const base = {
    period: '28d',
    from: null,
    summary: {
      key: videoKeyOf('upload', UPLOAD),
      provider: 'upload',
      externalId: UPLOAD,
      title: 'المحاضرة',
      courseTitle: 'الكورس',
      lessonCount: 1,
      durationSeconds: 600,
      sourceName: null,
      views: 0,
      uniqueViewers: 0,
      watchSeconds: 0,
      avgViewSeconds: null,
      avgPercentWatched: null,
      completedViewers: 0,
      completionRate: null,
      lastViewedAt: null,
    },
    lessons: [],
    daily: [],
    byHour: new Array<number>(24).fill(0),
    viewers: [],
  };

  it('holds exactly one retention point per 5% step, 0% and 100% included', () => {
    const curve = new Array<number>(RETENTION_STEPS + 1).fill(0.5);
    expect(() => VideoAnalyticsDetailSchema.parse({ ...base, retention: curve })).not.toThrow();
    expect(() => VideoAnalyticsDetailSchema.parse({ ...base, retention: curve.slice(1) })).toThrow();
    expect(() => VideoAnalyticsDetailSchema.parse({ ...base, retention: null })).not.toThrow();
  });
});
