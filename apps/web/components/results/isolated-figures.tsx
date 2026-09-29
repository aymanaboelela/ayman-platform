import { Fragment } from 'react';

const FIGURE = /(\d+(?:\.\d+)?%?)/;

/**
 * A copy sentence with every figure in it isolated as left-to-right.
 *
 * «من 85% لحد 100%» comes out of `formatCopy` as one string, and inside an
 * RTL paragraph Chrome sets the percent sign on the LEFT of its number — measured
 * on this page: `%` at x=60, `8` at x=82. So the sentence read «%85» while
 * the gauge, the chart labels and every card beside it read «85%»: one page,
 * two spellings of the same number. The house rule for Latin inside Arabic is
 * `direction: ltr; unicode-bidi: isolate` (`.rs-ltr`), and this applies it to
 * the figures of a sentence that arrives whole.
 */
export function IsolatedFigures({ text }: { text: string }) {
  return (
    <>
      {text.split(FIGURE).map((part, index) =>
        // `split` with one capture group puts the figures at the odd indexes.
        index % 2 === 1 ? (
          <span key={index} className="rs-ltr">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
