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

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
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
