import { describe, expect, it } from 'vitest';
import {
  ChallengeTopicInputSchema,
  ChallengeTopicPatchSchema,
  VARIANT_GROUP_KEY,
  challengeShortFor,
  freshFirst,
  isFoundationCourse,
  topicCounts,
  type Exposure,
} from './challenges';

const entry = (id: string, group: string | null = null) => ({ bankEntryId: id, variantGroupKey: group });
/** ترتيب ثابت للتعادل — أول واحد في اللستة يكسب. */
const fixed = () => 0;

describe('freshFirst', () => {
  it('serves what was never seen before anything seen, oldest-seen next', () => {
    const seen = new Map<string, Exposure>([
      ['e:a', { at: 2_000, times: 1 }],
      ['e:b', { at: 1_000, times: 3 }],
    ]);
    const order = freshFirst([entry('a'), entry('b'), entry('c')], seen, fixed).map((item) => item.bankEntryId);
    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('deals one wording per variant group — the one seen least — and dates the group, not the wording', () => {
    const seen = new Map<string, Exposure>([
      ['g:loops', { at: 5_000, times: 2 }],
      ['e:v1', { at: 5_000, times: 2 }],
      ['e:v2', { at: 1_000, times: 0 }],
      ['e:solo', { at: 3_000, times: 1 }],
    ]);
    const order = freshFirst([entry('v1', 'loops'), entry('v2', 'loops'), entry('solo')], seen, fixed);
    // المجموعة اتشافت آخر مرة ٥٠٠٠ (بعد solo)، فبتيجي تانية، بالصيغة اللي اتشافت أقل.
    expect(order.map((item) => item.bankEntryId)).toEqual(['solo', 'v2']);
  });
});

describe('topicCounts', () => {
  it('adds the lessons of several topics once, even when topics overlap', () => {
    const topics = [
      { id: 't1', title: 'الوحدة', lessonIds: ['l1', 'l2'] },
      { id: 't2', title: 'الدرس التاني', lessonIds: ['l2'] },
    ];
    const buckets = [
      { lessonId: 'l1', counts: { easy: 1, medium: 2, hard: 0 } },
      { lessonId: 'l2', counts: { easy: 0, medium: 3, hard: 1 } },
      { lessonId: 'l9', counts: { easy: 9, medium: 9, hard: 9 } },
    ];
    expect(topicCounts(topics, buckets, ['t1', 't2'])).toEqual({ easy: 1, medium: 5, hard: 1 });
    expect(topicCounts(topics, buckets, ['t2'])).toEqual({ easy: 0, medium: 3, hard: 1 });
    expect(topicCounts(topics, buckets, [])).toEqual({ easy: 0, medium: 0, hard: 0 });
  });
});

describe('admin inputs', () => {
  it('refuses a topic with no unit and no lesson, and a blank title', () => {
    expect(ChallengeTopicInputSchema.safeParse({ title: 'x', sectionIds: [], lessonIds: [], isActive: true }).success).toBe(false);
    expect(
      ChallengeTopicInputSchema.safeParse({ title: '   ', sectionIds: [], lessonIds: ['01990000-0000-7000-8000-00000000abcd'], isActive: true })
        .success,
    ).toBe(false);
  });

  it('a patch with one field carries only that field — no default sneaks the others back', () => {
    expect(ChallengeTopicPatchSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });

  it('warns for every game a topic is too small for', () => {
    expect(challengeShortFor(6)).toEqual(['millionaire', 'arena']);
    expect(challengeShortFor(15)).toEqual([]);
  });
});

describe('isFoundationCourse / VARIANT_GROUP_KEY', () => {
  it('matches تأسيس in the title or the subtitle', () => {
    expect(isFoundationCourse({ title: 'الكورس التأسيسي' })).toBe(true);
    expect(isFoundationCourse({ title: 'البرمجة', subtitle: 'مرحلة التأسيس' })).toBe(true);
    expect(isFoundationCourse({ title: 'البرمجة — تانية ثانوي', subtitle: null })).toBe(false);
  });

  it('takes one word of letters, digits and _ - .', () => {
    expect(VARIANT_GROUP_KEY.test('loops-1')).toBe(true);
    expect(VARIANT_GROUP_KEY.test('الحلقات_١')).toBe(true);
    expect(VARIANT_GROUP_KEY.test('two words')).toBe(false);
    expect(VARIANT_GROUP_KEY.test('')).toBe(false);
  });
});
