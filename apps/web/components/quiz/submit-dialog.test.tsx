import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts';
import { SubmitDialog } from './submit-dialog';
import { apiGet } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDialog() {
  return render(
    <SubmitDialog
      open
      onOpenChange={() => {}}
      attemptId="att-1"
      locallyUnanswered={[]}
      onJump={() => {}}
      onConfirm={async () => {}}
    />,
  );
}

/**
 * `name` is matched as a PREFIX, not for equality, and that is about jsdom
 * rather than about the button.
 *
 * The confirm control renders both of its labels — «أيوه، سلّم» and
 * «بيتسلّم…» — stacked in one grid cell, with the inactive one carrying
 * Tailwind's `invisible`. In a browser that is `visibility: hidden`, which
 * takes the spare label out of the accessibility tree, so the accessible name
 * really is just the active label (the component says so, and picked
 * `invisible` over `opacity-0` for exactly this reason).
 *
 * jsdom never runs Tailwind. No stylesheet backs `.invisible` here, so
 * `dom-accessibility-api` sees two visible text nodes and computes the name as
 * «أيوه، سلّم بيتسلّم…». An equality match therefore fails in this environment
 * while the production behaviour is correct — so asserting equality would be
 * asserting a jsdom artefact.
 *
 * A prefix match keeps what these tests are actually about (which button, and
 * is it disabled) and stays true under either name computation. The real
 * accessible name is covered where it can be computed honestly: in Playwright,
 * against a browser that has the CSS.
 */
function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', {
    name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  }) as HTMLButtonElement;
}

describe('SubmitDialog — I11 (a failed preflight must not wedge the dialog)', () => {
  it('surfaces a retry and keeps confirm enabled when the preflight fetch fails', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network'));
    renderDialog();

    // The error state is reachable, with a retry affordance...
    const retry = await screen.findByRole('button', { name: copy.common.retry });
    expect(retry).toBeTruthy();
    expect(screen.getByText(copy.common.error)).toBeTruthy();
    // ...and confirm is NOT dead: the count is advisory, the server recomputes
    // it on submit, so the student can still push through a transient blip.
    expect(button(copy.quiz.submitConfirmAction).disabled).toBe(false);
  });

  it('recovers on retry: a successful second preflight replaces the error with the count', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network'));
    mockApiGet.mockResolvedValueOnce({ unansweredCount: 0, total: 3 });
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: copy.common.retry }));

    await waitFor(() => {
      expect(screen.getByText(copy.quiz.submitConfirmAllAnswered)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: copy.common.retry })).toBeNull();
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('while the preflight is still in flight, confirm stays disabled (no premature submit)', () => {
    mockApiGet.mockReturnValueOnce(new Promise(() => {}));
    renderDialog();

    expect(screen.getByText(copy.common.loading)).toBeTruthy();
    expect(button(copy.quiz.submitConfirmAction).disabled).toBe(true);
  });
});
