import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { copy } from '@ayman/contracts/copy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiPostVoid } from '@/lib/api';
import { ShareCardDialog } from './share-card-dialog';

vi.mock('@/lib/fonts', () => ({ lalezar: { variable: 'f-lalezar' }, ruqaa: { variable: 'f-ruqaa' } }));
vi.mock('@/lib/api', () => ({ apiPostVoid: vi.fn(async () => undefined) }));

afterEach(() => {
  cleanup();
  vi.mocked(apiPostVoid).mockClear();
});

/**
 * «ناس شغالة وناس لا» — the card is drawn on the phone, so a failure left no
 * trace the server could see. The dialog now says which step threw.
 */
describe('ShareCardDialog — a card that cannot be drawn', () => {
  it('shows the retry, and reports the step and the error', async () => {
    const draw = vi.fn(() => {
      throw new TypeError('ctx is null');
    });
    render(<ShareCardDialog open onOpenChange={() => undefined} title="كارت" fileName="exam-certificate" draw={draw} />);

    expect(await screen.findByRole('button', { name: copy.shareCard.retry })).toBeTruthy();
    await waitFor(() => expect(apiPostVoid).toHaveBeenCalledTimes(1));
    expect(apiPostVoid).toHaveBeenCalledWith('/api/me/share-cards/render-failures', {
      card: 'exam-certificate',
      stage: 'draw',
      errorName: 'TypeError',
      errorMessage: 'ctx is null',
      attempt: 0,
    });

    fireEvent.click(screen.getByRole('button', { name: copy.shareCard.retry }));
    await waitFor(() => expect(apiPostVoid).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiPostVoid).mock.calls[1]?.[1]).toMatchObject({ attempt: 1 });
  });

  it('a report that fails is not a second error on screen', async () => {
    vi.mocked(apiPostVoid).mockRejectedValueOnce(new Error('offline'));
    render(
      <ShareCardDialog
        open
        onOpenChange={() => undefined}
        title="كارت"
        fileName="recap-2026-11"
        draw={() => {
          throw new Error('boom');
        }}
      />,
    );
    expect(await screen.findByText(copy.shareCard.failed)).toBeTruthy();
    expect(vi.mocked(apiPostVoid).mock.calls[0]?.[1]).toMatchObject({ card: 'recap' });
  });
});
