import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { parseQuestionBlocks } from './import';
import { QuestionInputSchema } from './question';

const CATEGORY = '018f0000-0000-7000-8000-000000000000';

describe('parseQuestionBlocks', () => {
  it('parses an Aiken-style single-choice block', () => {
    const result = parseQuestionBlocks(
      `ما ناتج 2 + 2؟
A. 3
B. 4
C. 5
ANSWER: B`,
      CATEGORY,
    );
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    const question = result.questions[0]!;
    expect(question.type).toBe('mcq_single');
    expect(question.stemHtml).toBe('<p>ما ناتج 2 + 2؟</p>');
    expect(question.options.map((o) => o.fraction)).toEqual([0, 1, 0]);
  });

  it('parses an ordering block with no ANSWER line — the items are the answer', () => {
    const result = parseQuestionBlocks(
      `رتّب من الأسرع للأبطأ
النوع: ترتيب
A. CPU
B. Cache
C. RAM
D. Storage`,
      CATEGORY,
    );
    expect(result.errors).toEqual([]);
    const question = result.questions[0]!;
    expect(question.type).toBe('ordering');
    expect(question.options.map((option) => (option as { bodyHtml: string }).bodyHtml)).toEqual([
      '<p>CPU</p>',
      '<p>Cache</p>',
      '<p>RAM</p>',
      '<p>Storage</p>',
    ]);
    // No row is worth anything on its own — the sequence is the key, and
    // `quantizeOptionWeights` would rewrite flat 1s into an out-of-range
    // weight on the way to the database.
    expect(question.options.every((option) => option.fraction === 0)).toBe(true);
  });

  it('accepts the Latin type keyword for ordering too', () => {
    const result = parseQuestionBlocks(`رتّب\nTYPE: ordering\nA. أ\nB. ب\nC. ج`, CATEGORY);
    expect(result.errors).toEqual([]);
    expect(result.questions[0]!.type).toBe('ordering');
  });

  it('rejects an ordering block with fewer than three items', () => {
    const result = parseQuestionBlocks(`رتّب\nالنوع: ترتيب\nA. أ\nB. ب`, CATEGORY);
    expect(result.questions).toEqual([]);
    expect(result.errors[0]!.message).toBe(copy.quizErrors.orderingNeedsThree);
  });

  it('accepts Arabic option letters and an Arabic answer keyword', () => {
    const result = parseQuestionBlocks(
      `أي دالة بتطبع على الشاشة؟
أ. input
ب. print
ج. len
الإجابة: ب`,
      CATEGORY,
    );
    expect(result.errors).toEqual([]);
    expect(result.questions[0]!.options[1]!.fraction).toBe(1);
  });

  it('produces mcq_multi when the answer line names more than one letter', () => {
    const result = parseQuestionBlocks(
      `اختار لغات البرمجة
A. Python
B. HTML
C. C++
ANSWER: A, C`,
      CATEGORY,
    );
    const question = result.questions[0]!;
    expect(question.type).toBe('mcq_multi');
    // Weights are split evenly so they sum to exactly 1 and satisfy the shared
    // schema's own multi-choice rule.
    expect(question.options.map((o) => o.fraction)).toEqual([0.5, 0, 0.5]);
  });

  it('produces true_false from صح/خطأ options', () => {
    const result = parseQuestionBlocks(
      `الـ while بتتنفذ طول ما الشرط صح
أ. صح
ب. خطأ
الإجابة: أ`,
      CATEGORY,
    );
    expect(result.questions[0]!.type).toBe('true_false');
  });

  it('parses a short answer with = patterns', () => {
    const result = parseQuestionBlocks(
      `TYPE: short
اكتب الكلمة المفتاحية للحلقة المحددة
= for
= For*`,
      CATEGORY,
    );
    const question = result.questions[0]!;
    expect(question.type).toBe('short_answer');
    if (question.type !== 'short_answer') throw new Error('expected short_answer');
    expect(question.options.map((o) => o.answerPattern)).toEqual(['for', 'For*']);
    expect(question.options[0]!.fraction).toBe(1);
  });

  it('parses an essay block with no options', () => {
    const result = parseQuestionBlocks(
      `TYPE: essay
اشرح الفرق بين الحلقة المحددة وغير المحددة`,
      CATEGORY,
    );
    expect(result.questions[0]!.type).toBe('essay');
    expect(result.questions[0]!.options).toEqual([]);
  });

  it('splits blocks on blank lines and keeps multi-line stems', () => {
    const result = parseQuestionBlocks(
      `السؤال الأول
سطر تاني من نفس السؤال
A. أ
B. ب
ANSWER: A

السؤال التاني
A. أ
B. ب
ANSWER: B`,
      CATEGORY,
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]!.stemHtml).toBe('<p>السؤال الأول</p><p>سطر تاني من نفس السؤال</p>');
  });

  it('reports a missing answer line with a 1-based block number and a line number', () => {
    const result = parseQuestionBlocks(
      `سؤال بدون إجابة
A. أ
B. ب`,
      CATEGORY,
    );
    expect(result.questions).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ blockIndex: 1, line: 1 });
  });

  it('reports an answer letter that has no matching option', () => {
    const result = parseQuestionBlocks(
      `سؤال
A. أ
B. ب
ANSWER: D`,
      CATEGORY,
    );
    expect(result.errors[0]!.message).toContain('D');
  });

  it('keeps the good blocks and reports only the bad ones', () => {
    const result = parseQuestionBlocks(
      `سليم
A. أ
B. ب
ANSWER: A

معطوب
A. أ`,
      CATEGORY,
    );
    expect(result.questions).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.blockIndex).toBe(2);
  });

  it('ignores trailing whitespace, CRLF line endings and stray blank lines', () => {
    const result = parseQuestionBlocks(
      'سؤال\r\nA. أ  \r\nB. ب\r\nANSWER: A\r\n\r\n\r\n',
      CATEGORY,
    );
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });

  it('emits only questions that the SHARED schema accepts', () => {
    const result = parseQuestionBlocks(
      `سؤال
A. أ
B. ب
ANSWER: A

سؤال تاني
أ. صح
ب. خطأ
الإجابة: ب`,
      CATEGORY,
    );
    for (const question of result.questions) {
      expect(QuestionInputSchema.safeParse(question).success).toBe(true);
    }
  });

  it('returns an explicit error for empty input rather than an empty success', () => {
    const result = parseQuestionBlocks('   \n\n  ', CATEGORY);
    expect(result.questions).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  describe('EXPLANATION / GROUP / LESSON lines', () => {
    const LESSON = '01990000-0000-7000-8000-00000000abcd';

    it('carries the explanation, the variant group and the lesson out of the block', () => {
      const result = parseQuestionBlocks(
        `الحلقة for بتتنفّذ كام مرة لو range(3)؟
A. 2
B. 3
C. 4
ANSWER: B
EXPLANATION: range(3) بتطلّع 0 و1 و2 — يعني تلات مرات.
GROUP: loops-range-1
LESSON: ${LESSON.toUpperCase()}`,
        CATEGORY,
      );
      expect(result.errors).toEqual([]);
      const question = result.questions[0]!;
      // The directive lines never leak into the stem or the options.
      expect(question.stemHtml).toBe('<p>الحلقة for بتتنفّذ كام مرة لو range(3)؟</p>');
      expect(question.options).toHaveLength(3);
      expect(question.generalFeedbackHtml).toBe('<p>range(3) بتطلّع 0 و1 و2 — يعني تلات مرات.</p>');
      expect(result.meta).toEqual([{ variantGroupKey: 'loops-range-1', lessonId: LESSON }]);
    });

    it('reads the Arabic keywords, and escapes the explanation instead of trusting it', () => {
      const result = parseQuestionBlocks(
        `السؤال
أ. صح
ب. خطأ
الإجابة: أ
الشرح: <img src=x onerror=alert(1)> مش HTML
الشرح: سطر تاني
المجموعة: الحلقات_١`,
        CATEGORY,
      );
      expect(result.errors).toEqual([]);
      expect(result.questions[0]!.generalFeedbackHtml).toBe(
        '<p>&lt;img src=x onerror=alert(1)&gt; مش HTML</p><p>سطر تاني</p>',
      );
      expect(result.meta[0]).toEqual({ variantGroupKey: 'الحلقات_١', lessonId: null });
    });

    it('keeps meta index-aligned with the questions, null where a block says nothing', () => {
      const result = parseQuestionBlocks(`س١\nA. x\nB. y\nANSWER: A\n\nس٢\nA. x\nB. y\nANSWER: B\nGROUP: g2`, CATEGORY);
      expect(result.questions).toHaveLength(2);
      expect(result.meta).toEqual([
        { variantGroupKey: null, lessonId: null },
        { variantGroupKey: 'g2', lessonId: null },
      ]);
    });

    it('rejects a group with a space and a lesson that is not an id, naming the block', () => {
      const result = parseQuestionBlocks(
        `س١\nA. x\nB. y\nANSWER: A\nGROUP: two words\n\nس٢\nA. x\nB. y\nANSWER: B\nLESSON: الدرس التالت`,
        CATEGORY,
      );
      expect(result.questions).toEqual([]);
      expect(result.errors.map((error) => error.blockIndex)).toEqual([1, 2]);
      expect(result.errors[0]!.message).toContain('two words');
      expect(result.errors[1]!.message).toContain('الدرس التالت');
    });
  });
});
