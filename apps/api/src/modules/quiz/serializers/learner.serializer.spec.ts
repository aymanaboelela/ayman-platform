import { FORBIDDEN_ANSWER_KEYS, collectKeysDeep, toLearnerQuestion } from './learner.serializer';

const row = {
  id: 'v1',
  type: 'mcq_single' as const,
  stemHtml: '<p>ما ناتج 2 + 2؟</p>',
  settings: { shuffleOptions: true, minWords: 10, maxWords: 100, graderInfo: 'الإجابة هي 4' },
  options: [
    { id: 'o1', bodyHtml: '<p>3</p>', position: 0 },
    { id: 'o2', bodyHtml: '<p>4</p>', position: 1 },
    { id: 'o3', bodyHtml: '<p>5</p>', position: 2 },
  ],
};

const attemptQuestion = {
  slotPosition: 0,
  maxMark: 2,
  optionOrder: [2, 0, 1],
  response: { kind: 'choice' as const, optionIds: ['o1'] },
  flagged: true,
  state: 'graded_right' as const,
};

describe('toLearnerQuestion', () => {
  it('renders options in the SNAPSHOTTED order, not the authoring order', () => {
    const result = toLearnerQuestion(row, attemptQuestion);
    expect(result.options.map((option) => option.id)).toEqual(['o3', 'o1', 'o2']);
  });

  it('emits only id and bodyHtml per option', () => {
    const result = toLearnerQuestion(row, attemptQuestion);
    for (const option of result.options) {
      expect(Object.keys(option).sort()).toEqual(['bodyHtml', 'id']);
    }
  });

  it('drops graderInfo from settings while keeping the word limits', () => {
    const result = toLearnerQuestion(row, attemptQuestion);
    expect(result.settings).toEqual({ minWords: 10, maxWords: 100 });
  });

  it('projects the grading state down to a boolean — graded_right must never ship', () => {
    const result = toLearnerQuestion(row, attemptQuestion);
    expect(result.answered).toBe(true);
    expect(result).not.toHaveProperty('state');
    expect(JSON.stringify(result)).not.toContain('graded_right');
  });

  it('carries no forbidden key at any depth', () => {
    const keys = collectKeysDeep(toLearnerQuestion(row, attemptQuestion));
    for (const key of keys) {
      expect(FORBIDDEN_ANSWER_KEYS.has(key)).toBe(false);
    }
  });

  it('survives an option_order that is shorter than the option list', () => {
    // Defensive: a snapshot written before an option was added (impossible with
    // the freeze trigger, but the serializer must not drop questions on the
    // floor if it ever happens).
    const result = toLearnerQuestion(row, { ...attemptQuestion, optionOrder: [1] });
    expect(result.options.map((o) => o.id)).toEqual(['o2', 'o1', 'o3']);
  });

  it('returns options in stored order when the snapshot is empty', () => {
    const result = toLearnerQuestion(row, { ...attemptQuestion, optionOrder: [] });
    expect(result.options.map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
  });
});

describe('collectKeysDeep', () => {
  it('walks arrays and nested objects', () => {
    expect([...collectKeysDeep({ a: [{ b: { c: 1 } }] })].sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not loop forever on a cycle', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => collectKeysDeep(cyclic)).not.toThrow();
  });
});
