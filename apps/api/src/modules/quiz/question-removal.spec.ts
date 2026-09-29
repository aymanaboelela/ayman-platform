import { countRemoval } from '@ayman/contracts/quiz/question-removal';
import { planRemoval, poolDrawsFrom, stemExcerpt, type RemovalCandidate, type RemovalPool } from './question-removal.service';

/**
 * The decision behind «امسح السؤال», with no database: every branch of
 * `planRemoval` as a plain function. The DB-backed half — the locks, the
 * cascade, the review that still renders — is `question-removal.service.spec.ts`.
 */

const quiz = (id: string, isPublished = true) => ({
  quizId: id,
  title: `امتحان ${id}`,
  courseTitle: 'الكورس',
  isPublished,
});

function candidate(overrides: Partial<RemovalCandidate> = {}): RemovalCandidate {
  return {
    id: 'entry-1',
    categoryId: 'cat-a',
    stemHtml: '<p>عاصمة مصر إيه؟</p>',
    readyTypes: ['mcq_single'],
    versionIds: ['v-1'],
    slotQuizzes: [],
    ...overrides,
  };
}

function pool(overrides: Partial<RemovalPool> = {}): RemovalPool {
  return {
    quiz: quiz('pooled'),
    filter: { categoryIds: ['cat-a'] },
    pickCount: 5,
    availableAfter: 10,
    ...overrides,
  };
}

describe('planRemoval', () => {
  it('deletes a question nobody answered and no quiz holds', () => {
    const [item] = planRemoval({ candidates: [candidate()], usedVersionIds: new Set(), pools: [] });
    expect(item).toMatchObject({ bankEntryId: 'entry-1', outcome: 'delete', quizzes: [] });
  });

  it('archives a question with history on ANY of its versions — not only the latest', () => {
    const [item] = planRemoval({
      candidates: [candidate({ versionIds: ['v-2', 'v-1'] })],
      usedVersionIds: new Set(['v-1']),
      pools: [],
    });
    expect(item!.outcome).toBe('archive');
  });

  it('refuses a question a quiz still has on its paper, and names the quiz once per quiz', () => {
    const [item] = planRemoval({
      // The same exam holding it on both papers is two slots, one quiz.
      candidates: [candidate({ slotQuizzes: [quiz('q1'), quiz('q1'), quiz('q2', false)] })],
      usedVersionIds: new Set(),
      pools: [],
    });
    expect(item!.outcome).toBe('blocked');
    expect(item!.quizzes.map((q) => [q.quizId, q.via, q.isPublished])).toEqual([
      ['q1', 'slot', true],
      ['q2', 'slot', false],
    ]);
  });

  it('refuses even an UNPUBLISHED draft quiz — it never edits a paper behind the teacher', () => {
    const [item] = planRemoval({
      candidates: [candidate({ slotQuizzes: [quiz('draft', false)] })],
      usedVersionIds: new Set(['v-1']),
      pools: [],
    });
    expect(item!.outcome).toBe('blocked');
  });

  it('refuses when a published pool would be left short of what it draws', () => {
    const [item] = planRemoval({
      candidates: [candidate()],
      usedVersionIds: new Set(),
      pools: [pool({ pickCount: 5, availableAfter: 4 })],
    });
    expect(item!.outcome).toBe('blocked');
    expect(item!.quizzes).toEqual([{ ...quiz('pooled'), via: 'pool' }]);
  });

  it('lets a pool that still has enough go on without it', () => {
    const [item] = planRemoval({
      candidates: [candidate()],
      usedVersionIds: new Set(['v-1']),
      pools: [pool({ pickCount: 5, availableAfter: 5 })],
    });
    expect(item!.outcome).toBe('archive');
  });

  it('ignores a short pool that could never have drawn this question', () => {
    const [item] = planRemoval({
      candidates: [candidate({ categoryId: 'cat-b' })],
      usedVersionIds: new Set(),
      pools: [pool({ pickCount: 5, availableAfter: 0 })],
    });
    expect(item!.outcome).toBe('delete');
  });

  it('decides each question on its own in a bulk delete', () => {
    const items = planRemoval({
      candidates: [
        candidate({ id: 'unused', versionIds: ['a'] }),
        candidate({ id: 'answered', versionIds: ['b'] }),
        candidate({ id: 'on-paper', versionIds: ['c'], slotQuizzes: [quiz('q1')] }),
      ],
      usedVersionIds: new Set(['b', 'c']),
      pools: [],
    });
    expect(items.map((item) => [item.bankEntryId, item.outcome])).toEqual([
      ['unused', 'delete'],
      ['answered', 'archive'],
      ['on-paper', 'blocked'],
    ]);
    expect(countRemoval(items)).toEqual({ delete: 1, archive: 1, blocked: 1 });
  });
});

describe('poolDrawsFrom', () => {
  it('matches the draw: category and type both have to fit, an empty filter takes everything', () => {
    const entry = { categoryId: 'cat-a', readyTypes: ['mcq_single' as const] };
    expect(poolDrawsFrom({}, entry)).toBe(true);
    expect(poolDrawsFrom({ categoryIds: ['cat-a'] }, entry)).toBe(true);
    expect(poolDrawsFrom({ categoryIds: ['cat-b'] }, entry)).toBe(false);
    expect(poolDrawsFrom({ types: ['essay'] }, entry)).toBe(false);
    expect(poolDrawsFrom({ types: ['essay', 'mcq_single'] }, entry)).toBe(true);
  });

  it('never matches a question with no ready version — a pool only draws ready ones', () => {
    expect(poolDrawsFrom({}, { categoryId: 'cat-a', readyTypes: [] })).toBe(false);
  });
});

describe('stemExcerpt', () => {
  it('is plain text, whitespace collapsed, and cut short with an ellipsis', () => {
    expect(stemExcerpt('<p>سؤال&nbsp;<strong>مهم</strong></p>\n<p>تاني</p>')).toBe('سؤال مهم تاني');
    const long = stemExcerpt(`<p>${'ا'.repeat(400)}</p>`);
    expect(long.length).toBe(140);
    expect(long.endsWith('…')).toBe(true);
  });
});
