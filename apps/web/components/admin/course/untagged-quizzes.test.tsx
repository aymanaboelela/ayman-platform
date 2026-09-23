import { describe, expect, it } from 'vitest';
import { untaggedLessons } from './month-panel';

type Section = Parameters<typeof untaggedLessons>[0][number];

function lesson(over: Partial<Section['lessons'][number]> = {}) {
  return {
    id: 'l-1',
    title: 'محاضرة',
    kind: 'video',
    isPublished: true,
    months: [],
    ...over,
  } as Section['lessons'][number];
}

function sections(lessons: Section['lessons']): Section[] {
  return [{ id: 's-1', title: 'الوحدة الأولى', lessons } as Section];
}

/**
 * الشاشة لازم تعدّ اللي السيرفر بيعدّه.
 *
 * `CourseMonthService.countUntagged` بيستخدم `PUBLISHED_ANY` — «منشور» وبس،
 * وكومنته بيقول «QUIZZES INCLUDED» بالحرف. والشاشة كانت بتستثني الكويزات في
 * الاتنين: الشريحة على السطر، والقايمة في البانل.
 *
 * يعني كويز منشور من غير شهر كان بيدّي طريق مقفول: السيرفر يرفض يفتح أي شهر
 * ويقول «فيه ١ من غير شهر»، والمدرّس يفتح القايمة يلاقيها **فاضية**. متقاله
 * صلّح حاجة ومش متوريّاله هي فين.
 */
describe('untaggedLessons', () => {
  it('counts a published quiz with no month, exactly as the server does', () => {
    const found = untaggedLessons(sections([lesson({ id: 'q-1', kind: 'quiz' })]));
    expect(found).toHaveLength(1);
    expect(found[0]?.lesson.id).toBe('q-1');
  });

  it('still counts an untagged lecture', () => {
    expect(untaggedLessons(sections([lesson({ id: 'v-1' })]))).toHaveLength(1);
  });

  /* المتعلّم خارج الحساب — ده اللي القايمة موجودة عشانه أصلًا. */
  it('leaves anything already in a month alone', () => {
    const tagged = sections([
      lesson({ id: 'v-1', months: [{ monthId: 'm-1' }] as never }),
      lesson({ id: 'q-1', kind: 'quiz', months: [{ monthId: 'm-1' }] as never }),
    ]);
    expect(untaggedLessons(tagged)).toHaveLength(0);
  });

  /* المسودّة مش منشورة، فمحدش بيستناها — ولا السيرفر بيعدّها. */
  it('ignores an unpublished draft, lecture or quiz', () => {
    const drafts = sections([
      lesson({ id: 'v-1', isPublished: false }),
      lesson({ id: 'q-1', kind: 'quiz', isPublished: false }),
    ]);
    expect(untaggedLessons(drafts)).toHaveLength(0);
  });
});
