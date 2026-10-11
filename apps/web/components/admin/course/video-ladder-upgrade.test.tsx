import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';

const state = vi.hoisted(() => ({
  get: vi.fn(),
  request: vi.fn(),
}));

vi.mock('@/app/(admin)/admin/courses/actions', () => ({
  videoLadderUpgradeAction: state.get,
  requestVideoLadderUpgradeAction: state.request,
}));

const { VideoLadderUpgradeButton } = await import('./video-ladder-upgrade');
const c = copy.admin.lesson;

const base = { available: true, state: null, progress: null, error: null, heights: [1080] };

afterEach(() => {
  cleanup();
  state.get.mockReset();
  state.request.mockReset();
});

describe('VideoLadderUpgradeButton', () => {
  it('draws nothing where the API says it is not available — the other stacks', async () => {
    state.get.mockResolvedValue({ ...base, available: false, heights: [] });
    const { container } = render(<VideoLadderUpgradeButton lessonId="l1" />);
    await act(async () => {});
    expect(container.textContent).toBe('');
  });

  it('offers the button for a lecture with one rung, and queues it on press', async () => {
    // The server's answer changes once the press has landed — the screen
    // re-reads it right after, so a mock that kept saying «idle» would undo it.
    const queued = { ...base, state: 'queued', progress: 0 };
    state.get.mockResolvedValueOnce(base).mockResolvedValue(queued);
    state.request.mockResolvedValue(queued);
    render(<VideoLadderUpgradeButton lessonId="l1" />);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: c.ladderButton }));
    await act(async () => {});

    expect(state.request).toHaveBeenCalledWith('l1');
    expect(screen.getByText(c.ladderQueued)).toBeTruthy();
    expect(screen.queryByRole('button', { name: c.ladderButton })).toBeNull();
  });

  it('shows the progress while it runs, and no button', async () => {
    state.get.mockResolvedValue({ ...base, state: 'running', progress: 40 });
    render(<VideoLadderUpgradeButton lessonId="l1" />);
    await act(async () => {});
    expect(screen.getByText(/40%/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says when every rung is already there, and offers no button', async () => {
    state.get.mockResolvedValue({ ...base, heights: [1080, 720, 480, 360] });
    render(<VideoLadderUpgradeButton lessonId="l1" />);
    await act(async () => {});
    expect(screen.getByText(c.ladderAllThere)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a retry after a failure, with the reason', async () => {
    state.get.mockResolvedValue({ ...base, state: 'failed', error: 'boom' });
    render(<VideoLadderUpgradeButton lessonId="l1" />);
    await act(async () => {});
    expect(screen.getByText(/boom/)).toBeTruthy();
    expect(screen.getByRole('button', { name: c.ladderRetry })).toBeTruthy();
  });
});
