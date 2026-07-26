import { describe, expect, it } from 'vitest';
import { QuestionInputSchema } from './question';

function mcqSingle(overrides: Record<string, unknown> = {}) {
  return {
    type: 'mcq_single',
    categoryId: '018f0000-0000-7000-8000-000000000000',
    stemHtml: '<p>ما ناتج 2 + 2؟</p>',
    defaultMark: 1,
    settings: {},
    options: [
      { bodyHtml: '<p>3</p>', fraction: 0 },
      { bodyHtml: '<p>4</p>', fraction: 1 },
    ],
    ...overrides,
  };
}

describe('QuestionInputSchema', () => {
  it('accepts a well-formed single-choice question', () => {
    expect(QuestionInputSchema.safeParse(mcqSingle()).success).toBe(true);
  });

  it('rejects a single-choice question with two full-credit options', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        options: [
          { bodyHtml: '<p>3</p>', fraction: 1 },
          { bodyHtml: '<p>4</p>', fraction: 1 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a single-choice question with no full-credit option', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        options: [
          { bodyHtml: '<p>3</p>', fraction: 0.5 },
          { bodyHtml: '<p>4</p>', fraction: 0.5 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('allows partial credit on the non-correct options of a single-choice question', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        options: [
          { bodyHtml: '<p>3</p>', fraction: 0.5 },
          { bodyHtml: '<p>4</p>', fraction: 1 },
          { bodyHtml: '<p>22</p>', fraction: -0.25 },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  // ── THE TRAP ────────────────────────────────────────────────────────────
  // A .refine() applied ON TOP of a discriminated union reports its issue with
  // `path: []`. react-hook-form maps issues onto fields by path, so an empty
  // path has no field to attach to and the message is never rendered: the form
  // simply refuses to submit with nothing on screen. Every refinement in this
  // schema therefore lives INSIDE a union member and carries an explicit path.
  it('gives every validation issue a non-empty path so RHF can render it', () => {
    const cases = [
      mcqSingle({ options: [{ bodyHtml: '<p>3</p>', fraction: 0 }] }),
      mcqSingle({
        options: [
          { bodyHtml: '<p>3</p>', fraction: 1 },
          { bodyHtml: '<p>4</p>', fraction: 1 },
        ],
      }),
      mcqSingle({ type: 'mcq_multi', options: [
        { bodyHtml: '<p>3</p>', fraction: 0.4 },
        { bodyHtml: '<p>4</p>', fraction: 0.4 },
      ] }),
      mcqSingle({ type: 'true_false', options: [
        { bodyHtml: '<p>صح</p>', fraction: 1 },
        { bodyHtml: '<p>خطأ</p>', fraction: 0 },
        { bodyHtml: '<p>يمكن</p>', fraction: 0 },
      ] }),
      { ...mcqSingle(), type: 'essay', options: [{ bodyHtml: '<p>x</p>', fraction: 1 }] },
    ];

    for (const input of cases) {
      const result = QuestionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      for (const issue of result.error!.issues) {
        expect(issue.path.length).toBeGreaterThan(0);
      }
    }
  });

  it('requires the multi-choice positive weights to sum to 1, with float tolerance', () => {
    const tenTenths = Array.from({ length: 10 }, () => ({ bodyHtml: '<p>x</p>', fraction: 0.1 }));
    // 0.1 summed ten times is 0.9999999999999999 in IEEE-754, so an `=== 1`
    // check here would reject a perfectly valid question.
    expect(tenTenths.reduce((sum, o) => sum + o.fraction, 0)).not.toBe(1);
    const result = QuestionInputSchema.safeParse(
      mcqSingle({ type: 'mcq_multi', options: tenTenths }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects multi-choice weights that do not sum to 1', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        type: 'mcq_multi',
        options: [
          { bodyHtml: '<p>أ</p>', fraction: 0.5 },
          { bodyHtml: '<p>ب</p>', fraction: 0.2 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires true_false to have exactly two options', () => {
    const result = QuestionInputSchema.safeParse(
      mcqSingle({
        type: 'true_false',
        options: [{ bodyHtml: '<p>صح</p>', fraction: 1 }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires a short answer to have at least one full-credit pattern', () => {
    const base = {
      type: 'short_answer',
      categoryId: '018f0000-0000-7000-8000-000000000000',
      stemHtml: '<p>اكتب الكلمة المفتاحية للحلقة</p>',
      defaultMark: 1,
      settings: { caseSensitive: false },
    };
    expect(
      QuestionInputSchema.safeParse({
        ...base,
        options: [{ answerPattern: 'for*', fraction: 1 }],
      }).success,
    ).toBe(true);
    expect(
      QuestionInputSchema.safeParse({
        ...base,
        options: [{ answerPattern: 'for*', fraction: 0.5 }],
      }).success,
    ).toBe(false);
  });

  it('rejects options on an essay question', () => {
    const result = QuestionInputSchema.safeParse({
      type: 'essay',
      categoryId: '018f0000-0000-7000-8000-000000000000',
      stemHtml: '<p>اشرح الفرق بين while و for</p>',
      defaultMark: 5,
      settings: { minWords: 30, maxWords: 200 },
      options: [{ bodyHtml: '<p>x</p>', fraction: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an essay whose maxWords is below minWords', () => {
    const result = QuestionInputSchema.safeParse({
      type: 'essay',
      categoryId: '018f0000-0000-7000-8000-000000000000',
      stemHtml: '<p>اشرح</p>',
      defaultMark: 5,
      settings: { minWords: 200, maxWords: 30 },
      options: [],
    });
    expect(result.success).toBe(false);
  });

  it('never exposes a grading weight it was not given — parse is not a default factory', () => {
    const parsed = QuestionInputSchema.parse(mcqSingle());
    expect(parsed.options.map((o) => o.fraction)).toEqual([0, 1]);
  });
});
