import { paperOptions, type WrittenOption } from './paper-options';

const option = (position: number, bodyHtml: string, fraction = 0): WrittenOption => ({
  id: `opt-${position}`,
  bodyHtml,
  position,
  fraction,
});

describe('paperOptions — the marking card’s options, as the student read them', () => {
  it('follows the order the student was served', () => {
    const written = [option(0, '<p>RAM</p>', 1), option(1, '<p>ROM</p>'), option(2, '<p>CPU</p>')];
    expect(paperOptions(written, [2, 0, 1]).map((row) => row.id)).toEqual(['opt-2', 'opt-0', 'opt-1']);
    expect(paperOptions(written, [2, 0, 1]).map((row) => row.isRight)).toEqual([false, true, false]);
    expect(paperOptions(written, [2, 0, 1]).map((row) => row.fraction)).toEqual([0, 1, 0]);
  });

  it('puts an option the snapshot does not name after the rest, instead of dropping it', () => {
    const written = [option(0, '<p>RAM</p>'), option(1, '<p>ROM</p>'), option(2, '<p>CPU</p>')];
    expect(paperOptions(written, [1, 1]).map((row) => row.id)).toEqual(['opt-1', 'opt-0', 'opt-2']);
  });

  it('takes the letters a teacher typed off — the card draws its own', () => {
    const written = [option(0, '<p>أ) siri</p>', 1), option(1, '<p>ب) alexa</p>'), option(2, '<p>ج) bixby</p>')];
    expect(paperOptions(written, [0, 1, 2]).map((row) => row.bodyHtml)).toEqual([
      '<p>siri</p>',
      '<p>alexa</p>',
      '<p>bixby</p>',
    ]);
  });

  it('leaves a lone option that only LOOKS lettered alone', () => {
    const written = [option(0, '<p>C. Babbage</p>', 1), option(1, '<p>Turing</p>'), option(2, '<p>Lovelace</p>')];
    expect(paperOptions(written, [0, 1, 2])[0]!.bodyHtml).toBe('<p>C. Babbage</p>');
  });
});
