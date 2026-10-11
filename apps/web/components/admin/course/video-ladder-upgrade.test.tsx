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

/** Lecture 5 as it stands: the copied 1080 and the 360 added by hand. */
const base = {
  available: true,
  state: null,
  progress: null,
  error: null,
  heights: [1080, 360],
  buildable: [720, 480],
  requested: [] as number[],
};

afterEach(() => {
  cleanup();
  state.get.mockReset();
  state.request.mockReset();
});

async function mount() {
  render(<VideoLadderUpgradeButton lessonId="l1" />);
  await act(async () => {});
}

describe('VideoLadderUpgradeButton', () => {
  it('draws nothing where the API says it is not available — the other stacks', async () => {
    state.get.mockResolvedValue({ ...base, available: false, heights: [], buildable: [] });
    const { container } = render(<VideoLadderUpgradeButton lessonId="l1" />);
    await act(async () => {});
    expect(container.textContent).toBe('');
  });

  it('offers every missing rung, ticked, and «الكل» sends an empty list — the worker builds what is missing', async () => {
    state.get.mockResolvedValue(base);
    const queued = { ...base, state: 'queued', progress: 0 };
    state.request.mockResolvedValue(queued);
    await mount();

    const chips = screen.getAllByRole('checkbox');
    expect(chips.map((chip) => chip.textContent)).toEqual(['720p', '480p']);
    expect(chips.every((chip) => chip.getAttribute('aria-checked') === 'true')).toBe(true);

    state.get.mockResolvedValue(queued);
    fireEvent.click(screen.getByRole('button', { name: c.ladderButtonAll }));
    await act(async () => {});

    expect(state.request).toHaveBeenCalledWith('l1', []);
    expect(screen.getByText(/في الطابور/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('sends only the ticked rungs — «720 بس»', async () => {
    state.get.mockResolvedValue(base);
    state.request.mockResolvedValue({ ...base, state: 'queued', progress: 0, requested: [720] });
    await mount();

    fireEvent.click(screen.getByRole('checkbox', { name: '480p' }));
    const go = screen.getByRole('button', { name: /اعمل 720p/ });
    fireEvent.click(go);
    await act(async () => {});

    expect(state.request).toHaveBeenCalledWith('l1', [720]);
  });

  it('will not start with nothing ticked', async () => {
    state.get.mockResolvedValue(base);
    await mount();
    fireEvent.click(screen.getByRole('checkbox', { name: '720p' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '480p' }));
    expect((screen.getByRole('button', { name: /اعمل|حسّن/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows what is being made and how far, with no controls, while it runs', async () => {
    state.get.mockResolvedValue({ ...base, state: 'running', progress: 40, requested: [720] });
    await mount();
    expect(screen.getByText(/720p/).textContent).toMatch(/40%/);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('says so when the server is busy and the job is waiting it out', async () => {
    state.get.mockResolvedValue({ ...base, state: 'waiting', progress: 30 });
    await mount();
    expect(screen.getByText(/السيرفر مشغول/)).toBeTruthy();
  });

  it('says when every rung is already there, and offers nothing to press', async () => {
    state.get.mockResolvedValue({ ...base, heights: [1080, 720, 480, 360], buildable: [] });
    await mount();
    expect(screen.getByText(c.ladderAllThere)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a retry after a failure, with the reason', async () => {
    state.get.mockResolvedValue({ ...base, state: 'failed', error: 'boom' });
    await mount();
    expect(screen.getByText(/boom/)).toBeTruthy();
    expect(screen.getByRole('button', { name: c.ladderRetry })).toBeTruthy();
  });
});
