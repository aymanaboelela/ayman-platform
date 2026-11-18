import { describe, expect, it } from 'vitest';
import {
  DailyEssayBatchSchema,
  DailyEssayMarkSchema,
  DailyEssaySubmitSchema,
  DailyEssayUpdateSchema,
  essayIsOpen,
  layEssayDays,
  shiftEssayDay,
} from './daily-essay';

const KEY = 'hw/ab/abcdef01-2345-7890-abcd-ef0123456789.webp';

describe('layEssayDays — where a batch lands', () => {
  it('lays questions on consecutive days from the start', () => {
    expect(layEssayDays('2031-03-10', 3, [])).toEqual(['2031-03-10', '2031-03-11', '2031-03-12']);
  });

  it('steps over a skipped weekday, and over a start that falls on one', () => {
    // 2031-03-13 is a Thursday; Friday is 5.
    expect(layEssayDays('2031-03-13', 3, [5])).toEqual(['2031-03-13', '2031-03-15', '2031-03-16']);
    expect(layEssayDays('2031-03-14', 1, [5])).toEqual(['2031-03-15']);
  });

  it('crosses a month end', () => {
    expect(layEssayDays('2031-01-31', 2, [])).toEqual(['2031-01-31', '2031-02-01']);
  });
});

describe('essayIsOpen — the answer window', () => {
  it('is open on its day and the day after, and at no other time', () => {
    const day = '2031-03-10';
    expect(essayIsOpen(day, shiftEssayDay(day, -1))).toBe(false);
    expect(essayIsOpen(day, day)).toBe(true);
    expect(essayIsOpen(day, shiftEssayDay(day, 1))).toBe(true);
    expect(essayIsOpen(day, shiftEssayDay(day, 2))).toBe(false);
  });
});

describe('DailyEssaySubmitSchema — photographs or text, one of them', () => {
  const image = { storageKey: KEY, sizeBytes: 1200 };

  it('takes photographs alone and text alone', () => {
    expect(DailyEssaySubmitSchema.safeParse({ images: [image] }).success).toBe(true);
    expect(DailyEssaySubmitSchema.safeParse({ text: 'إجابتي' }).success).toBe(true);
  });

  it('refuses both, neither, and text that is only spaces', () => {
    expect(DailyEssaySubmitSchema.safeParse({ images: [image], text: 'إجابتي' }).success).toBe(false);
    expect(DailyEssaySubmitSchema.safeParse({ images: [], text: null }).success).toBe(false);
    expect(DailyEssaySubmitSchema.safeParse({ text: '   ' }).success).toBe(false);
  });

  it('refuses a key that is not a homework-prefix photograph', () => {
    // The service DELETES these keys later, so any other object's key sent
    // here would be a key a student could have the platform erase.
    const cover = { storageKey: 'img/ab/abcdef01-2345-7890-abcd-ef0123456789.webp', sizeBytes: 1200 };
    expect(DailyEssaySubmitSchema.safeParse({ images: [cover] }).success).toBe(false);
  });
});

describe('the teacher-side schemas', () => {
  it('takes half marks and refuses finer ones', () => {
    expect(DailyEssayMarkSchema.safeParse({ mark: 7.5 }).success).toBe(true);
    expect(DailyEssayMarkSchema.safeParse({ mark: 7.25 }).success).toBe(false);
    expect(DailyEssayMarkSchema.safeParse({ mark: -1 }).success).toBe(false);
  });

  it('defaults a batch to ten marks, four photographs, published, everyone', () => {
    const batch = DailyEssayBatchSchema.parse({
      startDay: '2031-03-10',
      items: [{ body: 'اشرح الفرق', modelAnswer: 'الفرق هو…' }],
    });
    expect(batch).toMatchObject({ courseIds: [], skipWeekdays: [], maxImages: 4, isPublished: true });
    expect(batch.items[0]?.maxMarks).toBe(10);
  });

  it('injects NO default into a partial update', () => {
    // A default on a partial update silently rewrites what the caller did not
    // send — hiding a question must not also reset its marks.
    expect(DailyEssayUpdateSchema.parse({ isPublished: false })).toEqual({ isPublished: false });
  });
});
