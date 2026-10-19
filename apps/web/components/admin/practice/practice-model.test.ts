import { describe, expect, it } from 'vitest';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { AdminPracticeSetRow } from '@ayman/contracts/practice';
import { checkDraft, compareLessonCodes, emptyDraft, parsePastedQuestions, shelvesOf, unitHue } from './practice-model';

/**
 * The dashboard's non-visual half: the paste → batch narrowing, the editor's
 * checks, and the list's grouping. The component tests drive the same
 * functions through the screen; these pin the edges one at a time.
 */

describe('parsePastedQuestions', () => {
  it('maps a single-answer block to `mcq`, keyed on the letter the teacher wrote', () => {
    const [block] = parsePastedQuestions(
      'أي من الآتي من حقوق الملكية الفكرية؟\nا) حق المؤلف\nب) حق الانتخاب\nج) حق التعليم\nالإجابة: ج\nالشرح: سطر الشرح',
    );
    expect(block).toEqual({
      index: 1,
      ok: true,
      question: {
        type: 'mcq',
        stem: 'أي من الآتي من حقوق الملكية الفكرية؟',
        options: ['حق المؤلف', 'حق الانتخاب', 'حق التعليم'],
        answer: 2,
        explanation: 'سطر الشرح',
      },
    });
  });

  it('maps صح/غلط to `tf` with no options — 0 for صح, 1 for غلط, whichever row it is on', () => {
    const blocks = parsePastedQuestions(
      'براءة الاختراع بتحمي الفكرة.\nأ) صح\nب) غلط\nالإجابة: أ\n\nالشفرة المصدرية ملك المستخدم.\nA. True\nB. False\nANSWER: B\n\nسؤال معكوس\nأ) غلط\nب) صح\nالإجابة: ب',
    );
    expect(blocks.map((block) => (block.ok ? [block.question.type, block.question.options, block.question.answer] : null))).toEqual([
      ['tf', [], 0],
      ['tf', [], 1],
      ['tf', [], 0],
    ]);
  });

  it('puts every error beside its own paragraph and keeps the good ones in order', () => {
    const blocks = parsePastedQuestions(
      'سؤال سليم أول\nأ) واحد\nب) اتنين\nالإجابة: ب\n\nسؤال من غير إجابة\nأ) واحد\nب) اتنين\n\nسؤال سليم تاني\nأ) تلاتة\nب) أربعة\nالإجابة: أ',
    );
    expect(blocks.map((block) => [block.index, block.ok])).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
    expect(blocks[2]!.ok && blocks[2]!.question.stem).toBe('سؤال سليم تاني');
  });

  it('refuses what a practice set cannot hold rather than dropping it', () => {
    const blocks = parsePastedQuestions(
      'اختيارين صح\nأ) واحد\nب) اتنين\nج) تلاتة\nالإجابة: أ، ب\n\nسؤال مقالي من غير اختيارات\n\nرتّب\nTYPE: ordering\nأ) أول\nب) تاني\nج) تالت',
    );
    expect(blocks.every((block) => !block.ok)).toBe(true);
    expect(blocks.map((block) => (!block.ok ? block.message : ''))).toEqual([
      c.paste.unsupported,
      c.paste.unsupported,
      c.paste.unsupported,
    ]);
  });

  it('refuses more than six options', () => {
    const [block] = parsePastedQuestions('سؤال طويل\nأ) 1\nب) 2\nج) 3\nد) 4\nه) 5\nو) 6\nز) 7\nالإجابة: أ');
    expect(block).toEqual({ index: 1, ok: false, message: c.paste.tooManyOptions });
  });

  it('is empty for an empty box', () => {
    expect(parsePastedQuestions('  \n\n ')).toEqual([]);
  });
});

describe('checkDraft', () => {
  it('drops blank option rows and re-points the key through the drop', () => {
    const result = checkDraft({ ...emptyDraft(), stem: 'سؤال ما', options: ['أول', '', 'تالت', ''], answer: 2 });
    expect(result).toEqual({
      ok: true,
      input: { type: 'mcq', stem: 'سؤال ما', options: ['أول', 'تالت'], answer: 1, explanation: '' },
    });
  });

  it('never defaults the key', () => {
    const result = checkDraft({ ...emptyDraft(), stem: 'سؤال ما', options: ['أول', 'تاني', '', ''] });
    expect(result).toEqual({ ok: false, errors: { answer: c.question.errors.answer } });
  });

  it('says which rule failed, per field', () => {
    const result = checkDraft({ ...emptyDraft(), stem: 'س', options: ['نفس', 'نفس', '', ''], answer: 0 });
    expect(result).toEqual({
      ok: false,
      errors: { stem: c.question.errors.stem, options: c.question.errors.distinct },
    });
  });

  it('sends tf with no options, whatever the mcq rows still hold', () => {
    const result = checkDraft({ type: 'tf', stem: 'جملة صح', options: ['باقي من الاختيار'], answer: 1, explanation: ' شرح ' });
    expect(result).toEqual({ ok: true, input: { type: 'tf', stem: 'جملة صح', options: [], answer: 1, explanation: 'شرح' } });
  });
});

describe('the list', () => {
  const row = (over: Partial<AdminPracticeSetRow>): AdminPracticeSetRow => ({
    id: '0192f000-0000-7000-8000-000000000001',
    year: 2,
    track: 'arabic',
    lessonCode: '1-1',
    title: 'درس',
    unitTitle: null,
    articleSlug: null,
    questionCount: 0,
    published: false,
    updatedAt: '2026-10-18T00:00:00.000Z',
    ...over,
  });

  it('orders lesson codes as numbers, not strings', () => {
    expect(['2-10', '2-9', '10-1', '2-1'].sort(compareLessonCodes)).toEqual(['2-1', '2-9', '2-10', '10-1']);
  });

  it('shelves by year·track, then units, taking the first unit title it finds', () => {
    const shelves = shelvesOf([
      row({ lessonCode: '2-2', unitTitle: 'الوحدة الثانية' }),
      row({ lessonCode: '1-1' }),
      row({ lessonCode: '2-1' }),
      row({ lessonCode: '1-1', track: 'languages' }),
      row({ lessonCode: '1-1', year: 1 }),
    ]);
    expect(shelves.map((shelf) => `${shelf.year}:${shelf.track}`)).toEqual(['1:arabic', '2:arabic', '2:languages']);
    const second = shelves[1]!;
    expect(second.units.map((unit) => [unit.unit, unit.unitTitle, unit.rows.map((r) => r.lessonCode)])).toEqual([
      [1, null, ['1-1']],
      [2, 'الوحدة الثانية', ['2-1', '2-2']],
    ]);
  });

  it('never colours a unit green or red — those mean «right» and «delete» here', () => {
    for (let unit = 0; unit < 40; unit++) {
      const hue = unitHue(unit);
      expect(hue >= 125 && hue <= 170, `unit ${unit} → ${hue}`).toBe(false);
      expect(hue <= 35 || hue >= 345, `unit ${unit} → ${hue}`).toBe(false);
    }
  });
});
