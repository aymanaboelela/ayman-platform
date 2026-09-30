import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LtrRatio } from './ltr-ratio';

afterEach(cleanup);

describe('LtrRatio — «٢ / ٣» inside an RTL page', () => {
  it('puts BOTH numbers and the slash in one left-to-right isolate', () => {
    // One `<bdi>` around the pair. Two — one per number — is what
    // `isolateLtrRuns` would give ` / `, and the pair would still flip.
    const { container } = render(
      <p dir="rtl">
        <LtrRatio value={2} of={3} />
      </p>,
    );
    const isolates = container.querySelectorAll('bdi');
    expect(isolates).toHaveLength(1);
    expect(isolates[0]).toHaveAttribute('dir', 'ltr');
    expect(isolates[0]).toHaveTextContent(/^2 \/ 3$/);
  });

  it('prints a zero rather than dropping it', () => {
    const { container } = render(<LtrRatio value={0} of={5} />);
    expect(container).toHaveTextContent(/^0 \/ 5$/);
  });
});
