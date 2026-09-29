import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadedVideoPreview } from './uploaded-video-preview';

vi.mock('@/app/(admin)/admin/courses/actions', () => ({
  videoPreviewUrlAction: vi.fn(async (id: string) => `https://video.example.com/v/${id}/master.m3u8`),
}));
vi.mock('hls.js', () => ({ default: { isSupported: () => false } }));

afterEach(() => {
  cleanup();
});

const ID = 'a'.repeat(32);

/** «يبقى ظاهر لي الفيديو» — the uploaded lecture, visible on its own lesson. */
describe('UploadedVideoPreview', () => {
  it('shows the frame the encoder cut, beside the ladder, before anything loads', async () => {
    const { container } = render(<UploadedVideoPreview externalId={ID} />);
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe(`https://video.example.com/v/${ID}/poster.jpg`),
    );
    expect(container.querySelector('video')).toBeNull();
  });

  it('starts the player only when pressed', async () => {
    const { container } = render(<UploadedVideoPreview externalId={ID} />);
    const button = await screen.findByRole('button');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
  });
});
