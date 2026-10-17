import { mapOptionsBetweenVersions, remapOptionOrder, remapResponse, type MappableOption } from './remap';

const v = (prefix: string, bodies: string[]): MappableOption[] =>
  bodies.map((body, position) => ({ id: `${prefix}${position}`, bodyHtml: `<p>${body}</p>`, position }));

describe('mapOptionsBetweenVersions', () => {
  it('follows options by text when only the key moved', () => {
    // The live case: the key was on «Amazon» and the teacher moved it to «siri».
    const from = v('a', ['Amazon', 'siri', 'DeepL', 'YouTube']);
    const to = v('b', ['Amazon', 'siri', 'DeepL', 'YouTube']);
    expect([...mapOptionsBetweenVersions(from, to)]).toEqual([
      ['a0', 'b0'],
      ['a1', 'b1'],
      ['a2', 'b2'],
      ['a3', 'b3'],
    ]);
  });

  it('follows options the teacher reordered and re-lettered', () => {
    const from = v('a', ['أ) العمل عن بعد', 'ب) بيع وشراء السلع عبر الانترنت', 'ج) الدراسة عن بعد']);
    const to = v('b', ['بيع وشراء السلع عبر الإنترنت', 'الدراسة عن بعد', 'العمل عن بعد']);
    const mapping = mapOptionsBetweenVersions(from, to);
    expect(mapping.get('a0')).toBe('b2');
    expect(mapping.get('a1')).toBe('b0');
    expect(mapping.get('a2')).toBe('b1');
  });

  it('follows a typo fix that left the option in place', () => {
    const from = v('a', ['Amazone', 'siri']);
    const to = v('b', ['Amazon', 'siri']);
    expect(mapOptionsBetweenVersions(from, to).get('a0')).toBe('b0');
  });

  it('does NOT match a rewritten option to whatever replaced it', () => {
    // «أ و د معا» was the key; the teacher replaced it with a distractor and
    // made the first row the key. Matching by position would take the mark
    // away from everyone who chose what the teacher had meant.
    const from = v('a', ['تحيز بيانات التدريب', 'عدم وضوح السؤال', 'أ و د معا', 'بيانات غير كافية']);
    const to = v('b', ['تحيز بيانات التدريب', 'سرعة الجهاز', 'الدهاء', 'عدم التعاقد مع الشركة المصنعة']);
    const mapping = mapOptionsBetweenVersions(from, to);
    expect(mapping.get('a0')).toBe('b0');
    expect(mapping.has('a1')).toBe(false);
    expect(mapping.has('a2')).toBe(false);
    expect(mapping.has('a3')).toBe(false);
  });

  it('refuses an ambiguous text match', () => {
    // Two «نعم» in the new version and no position to break the tie.
    const from = v('a', ['نعم', 'لا']);
    const to = v('b', ['لا', 'نعم', 'نعم']);
    const mapping = mapOptionsBetweenVersions(from, to);
    expect(mapping.has('a0')).toBe(false);
    expect(mapping.get('a1')).toBe('b0');
  });
});

describe('remapResponse', () => {
  const mapping = new Map([
    ['a0', 'b0'],
    ['a1', 'b1'],
  ]);

  it('carries every chosen id across', () => {
    expect(remapResponse({ kind: 'choice', optionIds: ['a1'] }, mapping)).toEqual({ kind: 'choice', optionIds: ['b1'] });
  });

  it('refuses to half-move an answer', () => {
    expect(remapResponse({ kind: 'choice', optionIds: ['a1', 'a9'] }, mapping)).toBeNull();
  });

  it('passes text and empty answers through', () => {
    expect(remapResponse({ kind: 'text', text: 'x' }, mapping)).toEqual({ kind: 'text', text: 'x' });
    expect(remapResponse(null, mapping)).toBeNull();
  });
});

describe('remapOptionOrder', () => {
  it('keeps the order the student saw, in the new version’s positions', () => {
    const from = v('a', ['A', 'B', 'C']);
    const to = v('b', ['C', 'A', 'B', 'D']);
    const mapping = mapOptionsBetweenVersions(from, to);
    // Shown as C, A, B (old positions 2, 0, 1) → new positions 0, 1, 2; D last.
    expect(remapOptionOrder([2, 0, 1], from, to, mapping)).toEqual([0, 1, 2, 3]);
  });
});
