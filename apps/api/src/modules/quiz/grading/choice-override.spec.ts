import { checkChoiceOverride, describeChoice } from './choice-override';

const OPTIONS = [
  { id: 'a', bodyHtml: '<p>CPU &amp; Cache</p>' },
  { id: 'b', bodyHtml: '<p>RAM</p>' },
  { id: 'c', bodyHtml: '<p>Storage</p>' },
];

describe('checkChoiceOverride', () => {
  it('accepts one of the question’s own options on a single-answer question', () => {
    expect(checkChoiceOverride('mcq_single', OPTIONS, ['b'])).toEqual({ ok: true, optionIds: ['b'] });
    expect(checkChoiceOverride('true_false', OPTIONS, ['a'])).toEqual({ ok: true, optionIds: ['a'] });
  });

  it('refuses an id that is not one of THIS question’s options', () => {
    expect(checkChoiceOverride('mcq_single', OPTIONS, ['someone-elses'])).toEqual({
      ok: false,
      code: 'response_option_not_in_question',
    });
    expect(checkChoiceOverride('mcq_multi', OPTIONS, ['a', 'zzz'])).toEqual({
      ok: false,
      code: 'response_option_not_in_question',
    });
  });

  it('refuses two answers on a single-answer question, and none on any', () => {
    expect(checkChoiceOverride('mcq_single', OPTIONS, ['a', 'b'])).toEqual({ ok: false, code: 'response_shape_invalid' });
    expect(checkChoiceOverride('mcq_multi', OPTIONS, [])).toEqual({ ok: false, code: 'response_shape_invalid' });
  });

  it('refuses a question whose answer is not a choice — or is a sequence', () => {
    for (const type of ['essay', 'short_answer', 'ordering'] as const) {
      expect(checkChoiceOverride(type, OPTIONS, ['a'])).toEqual({ ok: false, code: 'response_not_editable' });
    }
  });

  it('stores a multi-answer correction in the paper’s own order, once each', () => {
    expect(checkChoiceOverride('mcq_multi', OPTIONS, ['c', 'a', 'c'])).toEqual({ ok: true, optionIds: ['a', 'c'] });
  });
});

describe('describeChoice', () => {
  it('is the chosen options’ TEXT — never their ids', () => {
    expect(describeChoice(OPTIONS, ['b'])).toBe('RAM');
    expect(describeChoice(OPTIONS, ['a', 'c'])).toBe('CPU & Cache، Storage');
  });

  it('is null when nothing is chosen', () => {
    expect(describeChoice(OPTIONS, [])).toBeNull();
  });
});
