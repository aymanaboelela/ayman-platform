import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { masculineAddress } from '@ayman/contracts/assistant/voice';
import {
  HomeworkReviewCardPayloadSchema,
  MessageCardPayloadSchema,
  homeworkCardHref,
  splitReviewNote,
} from '@ayman/contracts/assistant/homework-card';

describe('splitReviewNote — «غلط في إيه والتحسين إيه»', () => {
  it('sorts ✅ and ✏️ lines, keeping his own words before and after', () => {
    const parts = splitReviewNote(
      [
        'شغل حلو 👏',
        '✅ الخطوات مترتبة',
        '✏️ الوحدات ناقصة في السؤال التاني',
        '✅ الرسم واضح',
        '',
        'مستني المحاولة الجاية',
      ].join('\n'),
    );
    expect(parts).toEqual({
      structured: true,
      lead: ['شغل حلو 👏'],
      good: ['الخطوات مترتبة', 'الرسم واضح'],
      improve: ['الوحدات ناقصة في السؤال التاني'],
      tail: ['مستني المحاولة الجاية'],
    });
  });

  it('reads the marks a phone keyboard actually produces, behind a bullet or not', () => {
    const parts = splitReviewNote(['- ✅ أ', '1) ✔ ب', '• ✏ ج', '٢. 📝 د'].join('\n'));
    expect(parts.good).toEqual(['أ', 'ب']);
    expect(parts.improve).toEqual(['ج', 'د']);
  });

  it('leaves an unmarked note exactly as written', () => {
    const parts = splitReviewNote('تمام كده.\nكمل على كده.');
    expect(parts.structured).toBe(false);
    expect(parts.lead).toEqual(['تمام كده.', 'كمل على كده.']);
    expect(parts.good).toEqual([]);
    expect(parts.improve).toEqual([]);
  });

  it('drops nothing: every non-empty line lands in exactly one list', () => {
    const note = 'أولًا\n✅ واحد\nفي النص\n✏️ اتنين\nآخر';
    const parts = splitReviewNote(note);
    const count = parts.lead.length + parts.good.length + parts.improve.length + parts.tail.length;
    expect(count).toBe(note.split('\n').length);
  });
});

describe('the stored payload', () => {
  const payload = {
    kind: 'homework_review',
    submissionId: '0193c6f0-0000-7000-8000-0000000000aa',
    attempt: 1,
    lessonId: '0193c6f0-0000-7000-8000-0000000000bb',
    verdict: 'accepted',
    grade: 90,
  } as const;

  it('parses through the union a reader uses', () => {
    expect(MessageCardPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('refuses a kind it does not know, so the reader falls back to the plain bubble', () => {
    expect(MessageCardPayloadSchema.safeParse({ ...payload, kind: 'exam_review' }).success).toBe(false);
    expect(HomeworkReviewCardPayloadSchema.safeParse({ ...payload, grade: 140 }).success).toBe(false);
  });
});

describe('homeworkCardHref', () => {
  it('lands on the lecture’s homework panel', () => {
    expect(homeworkCardHref({ courseSlug: 'prog-2', lessonId: 'abc' })).toBe('/courses/prog-2/lessons/abc#homework');
  });
});

describe('the card’s copy', () => {
  it('never addresses the student as a boy', () => {
    for (const line of Object.values(copy.assistant.thread.homeworkCard)) {
      expect(masculineAddress(line), line).toEqual([]);
    }
  });
});
