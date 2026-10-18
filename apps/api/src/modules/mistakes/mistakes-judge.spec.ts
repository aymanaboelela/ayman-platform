import { judgeMistakeAnswer } from './mistakes.service';

/**
 * The notebook's verdict against the quiz's, on the weights the question
 * editor actually stores. Pure — no database: the bug was the rule, not a
 * query.
 */
describe('judgeMistakeAnswer', () => {
  // Three ticked answers, as `quantizeOptionWeights` writes them: one is a
  // hair bigger so the four sum to exactly 1.
  const multi = [
    { id: 'mouse', fraction: 0.333334, position: 0 },
    { id: 'keyboard', fraction: 0.333333, position: 1 },
    { id: 'screen', fraction: 0, position: 2 },
    { id: 'mic', fraction: 0.333333, position: 3 },
  ];

  it('calls all three right options of a three-answer mcq_multi right, and marks all three', () => {
    const judged = judgeMistakeAnswer('mcq_multi', multi, ['mic', 'mouse', 'keyboard']);
    expect(judged.correct).toBe(true);
    expect([...judged.rightOptionIds].sort()).toEqual(['keyboard', 'mic', 'mouse']);
  });

  it('does not call two of the three right', () => {
    expect(judgeMistakeAnswer('mcq_multi', multi, ['mouse', 'keyboard']).correct).toBe(false);
  });

  it('judges a single answer by its full-marks option', () => {
    const single = [
      { id: 'a', fraction: 0, position: 0 },
      { id: 'b', fraction: 1, position: 1 },
      { id: 'c', fraction: 0, position: 2 },
    ];
    expect(judgeMistakeAnswer('mcq_single', single, ['b'])).toEqual({ correct: true, rightOptionIds: ['b'] });
    expect(judgeMistakeAnswer('mcq_single', single, ['a'])).toEqual({ correct: false, rightOptionIds: ['b'] });
    // Two picks on a single answer is not an answer — the quiz marks it wrong too.
    expect(judgeMistakeAnswer('mcq_single', single, ['a', 'b']).correct).toBe(false);
  });

  it('judges true/false the same way', () => {
    const tf = [
      { id: 'true', fraction: 0, position: 0 },
      { id: 'false', fraction: 1, position: 1 },
    ];
    expect(judgeMistakeAnswer('true_false', tf, ['false']).correct).toBe(true);
    expect(judgeMistakeAnswer('true_false', tf, ['true']).correct).toBe(false);
  });
});
