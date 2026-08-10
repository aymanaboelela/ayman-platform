import { describe, expect, it } from 'vitest';
import {
  LessonVideoInputSchema,
  VideoProviderSchema,
  YOUTUBE_ID_RE,
  extractYouTubeId,
  youTubeEmbedUrl,
  youTubeThumbnailUrl,
} from './video';

const ID = 'dQw4w9WgXcQ'; // exactly 11 chars

describe('extractYouTubeId — accepted forms', () => {
  it.each([
    ['watch', `https://www.youtube.com/watch?v=${ID}`],
    ['watch with extra params', `https://www.youtube.com/watch?v=${ID}&list=PLabc&index=2&t=42s`],
    ['watch on m.', `https://m.youtube.com/watch?v=${ID}`],
    ['watch on music.', `https://music.youtube.com/watch?v=${ID}`],
    ['bare youtube.com', `https://youtube.com/watch?v=${ID}`],
    ['youtu.be', `https://youtu.be/${ID}`],
    ['youtu.be with timestamp', `https://youtu.be/${ID}?t=90`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['embed with params', `https://www.youtube.com/embed/${ID}?start=30&rel=0`],
    ['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['live', `https://www.youtube.com/live/${ID}`],
    ['/v/ legacy', `https://www.youtube.com/v/${ID}`],
    ['http not https', `http://www.youtube.com/watch?v=${ID}`],
    ['no scheme', `www.youtube.com/watch?v=${ID}`],
    ['surrounding whitespace', `   https://youtu.be/${ID}   `],
    ['uppercase host', `https://WWW.YouTube.COM/watch?v=${ID}`],
    ['a bare id, already stored', ID],
  ])('extracts the id from %s', (_label, input) => {
    expect(extractYouTubeId(input)).toBe(ID);
  });
});

describe('extractYouTubeId — rejected input', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['a lookalike host', `https://youtube.com.evil.example/watch?v=${ID}`],
    ['a subdomain impostor', `https://youtube.com.evil.example/embed/${ID}`],
    ['userinfo smuggling', `https://www.youtube.com@evil.example/watch?v=${ID}`],
    ['an open redirect', `https://evil.example/r?u=https://youtu.be/${ID}`],
    ['a different site entirely', `https://vimeo.com/${ID}`],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html;base64,PHNjcmlwdD4='],
    ['file scheme', 'file:///etc/passwd'],
    ['an internal address', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost', 'http://localhost:3300/api/health'],
    ['a 10-char id', 'https://youtu.be/dQw4w9WgXc'],
    ['a 12-char id', 'https://youtu.be/dQw4w9WgXcQQ'],
    ['an id with a dot', 'https://youtu.be/dQw4w9WgX.Q'],
    ['an id with a slash', 'https://youtu.be/dQw4w9WgX/Q'],
    ['a watch URL with no v', 'https://www.youtube.com/watch?list=PLabc'],
    ['a channel URL', 'https://www.youtube.com/@ayman'],
    ['a path traversal', `https://www.youtube.com/embed/../../${ID}`],
    ['an HTML injection attempt', `<img src=x onerror=alert(1)>${ID}`],
  ])('returns null for %s', (_label, input) => {
    expect(extractYouTubeId(input)).toBeNull();
  });

  it('never returns anything that fails the 11-char regex', () => {
    const corpus = ['https://youtu.be/AAAA', `https://youtu.be/${ID}`, 'nonsense', ID];
    for (const candidate of corpus) {
      const result = extractYouTubeId(candidate);
      if (result !== null) expect(YOUTUBE_ID_RE.test(result)).toBe(true);
    }
  });
});

describe('youTubeEmbedUrl', () => {
  it('reconstructs a nocookie embed URL from the id alone', () => {
    const url = new URL(youTubeEmbedUrl(ID));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(url.searchParams.get('rel')).toBe('0');
  });

  it('accepts an integer start offset', () => {
    expect(new URL(youTubeEmbedUrl(ID, { start: 90.7 })).searchParams.get('start')).toBe('90');
  });

  it('throws rather than emitting anything derived from a URL', () => {
    expect(() => youTubeEmbedUrl(`https://youtu.be/${ID}`)).toThrow(/11-character/);
    expect(() => youTubeEmbedUrl('../../evil')).toThrow(/11-character/);
  });
});

describe('youTubeThumbnailUrl', () => {
  it('points at i.ytimg.com, which is the only image host in the CSP', () => {
    expect(youTubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(youTubeThumbnailUrl(ID, 'maxres')).toBe(`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`);
  });
});

describe('VideoProviderSchema', () => {
  it('carries all seven providers even though v1 only writes one', () => {
    expect(VideoProviderSchema.options).toEqual([
      'youtube', 'upload', 'vimeo', 'bunny', 'vdocipher', 'ink', 'gumlet',
    ]);
  });
});

describe('LessonVideoInputSchema', () => {
  it('replaces the URL with the id and drops everything else', () => {
    const parsed = LessonVideoInputSchema.parse({
      provider: 'youtube',
      url: `https://www.youtube.com/watch?v=${ID}&list=PLsecret&si=trackingtoken`,
      durationSeconds: 612,
      posterKey: null,
    });
    expect(parsed).toEqual({
      provider: 'youtube',
      externalId: ID,
      durationSeconds: 612,
      posterKey: null,
    });
    expect(JSON.stringify(parsed)).not.toContain('youtube.com');
    expect(JSON.stringify(parsed)).not.toContain('PLsecret');
  });

  it('accepts a payload with NO duration — the normal admin save', () => {
    // The link is the only thing an instructor states; the service asks
    // YouTube for the rest. `null`, not `undefined`, so the service can branch
    // on one shape — see the field's own comment.
    const parsed = LessonVideoInputSchema.parse({
      provider: 'youtube',
      url: `https://youtu.be/${ID}`,
      posterKey: null,
    });
    expect(parsed.durationSeconds).toBeNull();
  });

  it('still refuses a duration that is stated and impossible', () => {
    for (const durationSeconds of [0, -1, 4.5, 12 * 60 * 60 + 1]) {
      const result = LessonVideoInputSchema.safeParse({
        provider: 'youtube',
        url: `https://youtu.be/${ID}`,
        durationSeconds,
        posterKey: null,
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects a URL it cannot reduce to an id', () => {
    const result = LessonVideoInputSchema.safeParse({
      provider: 'youtube',
      url: 'https://evil.example/video',
      durationSeconds: 10,
      posterKey: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects providers that have no implementation yet', () => {
    const result = LessonVideoInputSchema.safeParse({
      provider: 'vimeo',
      url: `https://youtu.be/${ID}`,
      durationSeconds: 10,
      posterKey: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys instead of silently dropping them', () => {
    const result = LessonVideoInputSchema.safeParse({
      provider: 'youtube',
      url: `https://youtu.be/${ID}`,
      durationSeconds: 10,
      posterKey: null,
      externalId: 'ATTACKERSET',
    });
    expect(result.success).toBe(false);
  });
});
