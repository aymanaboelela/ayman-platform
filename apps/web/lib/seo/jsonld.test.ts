import { describe, expect, it } from 'vitest';
import {
  breadcrumbJsonLd,
  courseJsonLd,
  courseListJsonLd,
  organizationJsonLd,
  secondsToIso8601Duration,
  videoObjectJsonLd,
} from './jsonld';

const course = (overrides = {}) => ({
  id: '0192f000-0000-7000-8000-000000000001',
  slug: 'programming-year-2',
  title: 'البرمجة وعلوم الحاسب',
  subtitle: 'الصف الثاني الثانوي',
  description: 'وصف الكورس',
  systemNameAr: 'البكالوريا المصرية',
  subjectNameAr: 'البرمجة وعلوم الحاسب',
  trackLabelAr: 'الهندسة وعلوم الحاسب',
  year: 2,
  lessonCount: 12,
  totalSeconds: 7200,
  publishedAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  ...overrides,
});

describe('secondsToIso8601Duration', () => {
  it.each([
    [0, 'PT0S'],
    [1, 'PT1S'],
    [59, 'PT59S'],
    [60, 'PT1M'],
    [90, 'PT1M30S'],
    [3600, 'PT1H'],
    [3661, 'PT1H1M1S'],
    [7200, 'PT2H'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(secondsToIso8601Duration(seconds)).toBe(expected);
  });
});

describe('courseListJsonLd', () => {
  it('returns null below three items — Google needs ≥3 for the list rich result', () => {
    expect(courseListJsonLd([course()])).toBeNull();
    expect(courseListJsonLd([course(), course({ slug: 'b' })])).toBeNull();
  });

  it('emits an ItemList of Course items at three or more', () => {
    const data = courseListJsonLd([
      course(),
      course({ slug: 'b', id: 'b' }),
      course({ slug: 'c', id: 'c' }),
    ]);
    expect(data?.['@type']).toBe('ItemList');
    expect(data?.itemListElement).toHaveLength(3);
    expect(data?.itemListElement[0]?.item['@type']).toBe('Course');
    expect(data?.itemListElement[0]?.position).toBe(1);
  });
});

describe('courseJsonLd', () => {
  it('marks the course free and Arabic, with an absolute URL', () => {
    const data = courseJsonLd(course());
    expect(data['@type']).toBe('Course');
    expect(data.inLanguage).toBe('ar');
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.offers?.price).toBe('0');
    expect(data.url).toMatch(/^https?:\/\/.+\/courses\/programming-year-2$/);
    expect(data.provider?.['@type']).toBe('Organization');
  });
});

describe('videoObjectJsonLd', () => {
  it('uses the reconstructed nocookie embed and an ISO-8601 duration', () => {
    const data = videoObjectJsonLd({
      externalId: 'dQw4w9WgXcQ',
      name: 'المقدمة',
      description: 'وصف',
      durationSeconds: 305,
      uploadDate: '2026-07-01T00:00:00.000Z',
    });
    expect(data.embedUrl).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(data.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(data.duration).toBe('PT5M5S');
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers positions from 1 and absolutises every item', () => {
    const data = breadcrumbJsonLd([
      { name: 'الرئيسية', path: '/' },
      { name: 'الكورسات', path: '/courses' },
    ]);
    expect(data.itemListElement[0]?.position).toBe(1);
    expect(data.itemListElement[1]?.item).toMatch(/\/courses$/);
  });
});

describe('the whole JSON-LD surface', () => {
  it('never emits FAQPage — Google removed the docs 2026-06-15, zero rich results', () => {
    const everything = JSON.stringify([
      organizationJsonLd(),
      courseListJsonLd([course(), course({ slug: 'b' }), course({ slug: 'c' })]),
      courseJsonLd(course()),
      breadcrumbJsonLd([{ name: 'الرئيسية', path: '/' }]),
    ]);
    expect(everything).not.toContain('FAQPage');
    expect(everything).not.toContain('Question');
  });
});
