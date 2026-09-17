import { describe, expect, it } from 'vitest';
import {
  HOMEWORK_ACCEPTED_NOTES,
  HOMEWORK_NEEDS_WORK_NOTES,
  HOMEWORK_SUGGESTION_COUNT,
  pickHomeworkSuggestions,
} from '@ayman/contracts/copy/homework';
import { HomeworkReviewSchema, HomeworkSubmitSchema, MAX_HOMEWORK_IMAGES } from '@ayman/contracts/homework';

describe('homework review contract', () => {
  it('refuses a grade on work that is coming back', () => {
    const result = HomeworkReviewSchema.safeParse({
      decision: 'needs_work',
      grade: 60,
      message: 'مراجعة صغيرة وابقى ابعته.',
    });
    expect(result.success).toBe(false);
    // The issue has to be attached to `grade`, or react-hook-form shows the
    // form as invalid with no visible error anywhere.
    expect(result.error?.issues[0]?.path).toEqual(['grade']);
  });

  it('accepts a mark, and accepts none', () => {
    expect(
      HomeworkReviewSchema.safeParse({ decision: 'accepted', grade: 10, message: 'تمام كده.' })
        .success,
    ).toBe(true);
    expect(
      HomeworkReviewSchema.safeParse({ decision: 'accepted', message: 'تمام كده.' }).success,
    ).toBe(true);
  });

  it('requires words on every decision', () => {
    expect(
      HomeworkReviewSchema.safeParse({ decision: 'needs_work', message: ' ' }).success,
    ).toBe(false);
  });
});

describe('homework submission contract', () => {
  it('needs at least one page and refuses more than the ceiling', () => {
    const page = { storageKey: 'hw/ab/x.webp', sizeBytes: 100 };
    expect(HomeworkSubmitSchema.safeParse({ images: [] }).success).toBe(false);
    expect(HomeworkSubmitSchema.safeParse({ images: [page] }).success).toBe(true);
    expect(
      HomeworkSubmitSchema.safeParse({
        images: Array.from({ length: MAX_HOMEWORK_IMAGES + 1 }, () => page),
      }).success,
    ).toBe(false);
  });
});

describe('the notes he picks from', () => {
  it('offers three distinct suggestions per verdict', () => {
    const picked = pickHomeworkSuggestions('0198c0de-0000-7000-8000-000000000001');
    expect(picked.accepted).toHaveLength(HOMEWORK_SUGGESTION_COUNT);
    expect(new Set(picked.accepted).size).toBe(HOMEWORK_SUGGESTION_COUNT);
    expect(new Set(picked.needsWork).size).toBe(HOMEWORK_SUGGESTION_COUNT);
  });

  it('is stable for one submission and moves for the next', () => {
    const a = pickHomeworkSuggestions('submission-a');
    expect(pickHomeworkSuggestions('submission-a')).toEqual(a);

    /*
     * Not "every other id differs" — a hash into a pool of eight collides for
     * some pairs and that is fine. What matters is that the window MOVES across
     * a realistic run of ids, or the feature is one fixed list wearing a seed.
     */
    const windows = new Set(
      Array.from({ length: 40 }, (_, index) =>
        pickHomeworkSuggestions(`submission-${index}`).accepted.join('|'),
      ),
    );
    expect(windows.size).toBeGreaterThan(4);
  });

  /**
   * The same tripwire `outreach/compose.spec.ts` carries, over these pools.
   *
   * The platform never asks whether a student is a boy or a girl, so a line
   * that can only be said to a male reader tells every female one the message
   * was not written for her. This catches whole tokens only — a prefixed
   * «وراجع» walks past it — and every entry below is a form that has actually
   * shipped in this codebase.
   */
  const MASCULINE_ONLY = new Set([
    // Imperatives. The feminine grows a ي.
    'راجع',
    'ارجع',
    'ابعته',
    'ابعت',
    'شوف',
    'ركّز',
    'خد',
    'حلّه',
    'صوّر',
    'فكّر',
    'كمّل',
    'دوس',
    // Negative imperatives.
    'متقلقش',
    'متزعلش',
    'متضايقش',
    // Second person, present and past.
    'تقدر',
    'قرّبت',
    'خلصت',
    'ذاكرت',
    'غلطت',
    'اتفرّج',
    'اتفرّجت',
    'كتبت',
    // Adjectives said ABOUT the reader — his own («مبسوط»، «شايف») are his to
    // inflect and are deliberately absent.
    'فاهم',
    'شاطر',
    'مجتهد',
    'ماشي',
    // Pronouns that grow a ي. The ـك suffix on a NOUN («حلّك»، «ورقتك») is one
    // spelling for both and is what the pools use instead.
    'معاك',
    'وراك',
    'بيك',
    'ليك',
    'فيك',
    'عليك',
  ]);

  it('never addresses her as a boy', () => {
    for (const line of [...HOMEWORK_ACCEPTED_NOTES, ...HOMEWORK_NEEDS_WORK_NOTES]) {
      for (const token of line.split(/[\s،.:؟!—«»…()٪]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» only works on a male reader: ${line}`).toBe(
          false,
        );
      }
    }
  });

  it('never tells a student their work is simply wrong and leaves it there', () => {
    // Rule 2 in `copy/homework.ts`: a line that only says «غلط» ends the
    // exercise. Every needs-work note has to name something to do next.
    for (const line of HOMEWORK_NEEDS_WORK_NOTES) {
      expect(line.length).toBeGreaterThan(30);
      expect(line).toMatch(/[.،]/u);
    }
  });
});
