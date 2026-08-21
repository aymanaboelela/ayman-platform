import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { EmphasisBadge } from './emphasis-badge';

afterEach(() => {
  cleanup();
});

/**
 * The rule this pins: **the badge is a label, and the note is the half that
 * carries the meaning.**
 *
 * «اختياري» alone reads as "skip this". «اختياري · لو خلصت تانية بكالوريا»
 * reads as an instruction — which is why the note renders as text rather than
 * as a `title` tooltip, and why a badge is allowed to appear without one but a
 * note is never rendered without a badge.
 */
describe('EmphasisBadge', () => {
  it('renders nothing when there is no badge', () => {
    const { container } = render(<EmphasisBadge emphasis={null} note={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  /*
   * Not merely "renders nothing useful" — renders NOTHING. Most courses have
   * no badge, so an empty wrapper here would put a stray flex box on every
   * card in the grid, and `.emphasis`'s row-gap would show up as dead space
   * under the stream chips on all of them.
   */
  it('renders nothing when a note arrives with no badge', () => {
    const { container } = render(<EmphasisBadge emphasis={null} note={'أساسي لأولى'} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['required', copy.emphasis.required],
    ['recommended', copy.emphasis.recommended],
    ['optional', copy.emphasis.optional],
  ] as const)('renders the Arabic label for %s', (emphasis, label) => {
    render(<EmphasisBadge emphasis={emphasis} note={null} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the note as visible text next to the badge', () => {
    const note = 'أساسي لأولى بكالوريا · اختياري لتانية';
    render(<EmphasisBadge emphasis="optional" note={note} />);
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  /*
   * The chip carries a per-value modifier because the three are coloured
   * differently — ember for «مهم», plain for «موصى به», unfilled for
   * «اختياري». A single class would collapse them into one look and lose the
   * ranking the badge exists to express.
   */
  it('varies the chip class by value', () => {
    const { container } = render(<EmphasisBadge emphasis="required" note={null} />);
    expect(container.querySelector('.emphasis__chip--required')).not.toBeNull();
  });

  it('never claims an obligation the platform does not enforce', () => {
    // «مهم», not «إجباري» — nothing on this platform forces a course open, and
    // the badge must not promise otherwise. See the copy's own note.
    expect(copy.emphasis.required).toBe('مهم');
  });
});
