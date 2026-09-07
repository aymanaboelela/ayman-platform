import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import type { PlayerVideo } from '@ayman/contracts/progress';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadYouTubeIframeApi = vi.fn();

vi.mock('@/lib/youtube', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/youtube')>()),
  loadYouTubeIframeApi: () => loadYouTubeIframeApi(),
}));

vi.mock('./use-video-heartbeat', () => ({
  useVideoHeartbeat: () => {},
}));

const { VideoLesson } = await import('./video-lesson');

const VIDEO: PlayerVideo = {
  youtubeId: 'WndSPGcPmfM',
  durationSeconds: 3696,
  posterUrl: null,
};

function renderPlayer() {
  return render(
    <VideoLesson
      lessonId="0198c3a2-0000-7000-8000-000000000001"
      video={VIDEO}
      title="How AI Works"
      resumeAt={0}
      onProgress={() => {}}
      onError={() => {}}
    />,
  );
}

beforeEach(() => {
  loadYouTubeIframeApi.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * The reported bug: a student presses play, the poster is torn down, and
 * nothing ever replaces it — an empty grey box with no message and no way
 * back. Both halves of it are a silence, not an error, so both need a clock.
 */
describe('VideoLesson poster', () => {
  it('drops a poster that fails to load rather than drawing a broken image', () => {
    render(
      <VideoLesson
        lessonId="0198c3a2-0000-7000-8000-000000000001"
        video={{ ...VIDEO, posterUrl: 'https://media.example.test/poster.webp' }}
        title="How AI Works"
        resumeAt={0}
        onProgress={() => {}}
        onError={() => {}}
      />,
    );

    const poster = document.querySelector('img');
    expect(poster).not.toBeNull();
    fireEvent.error(poster as HTMLImageElement);

    expect(document.querySelector('img')).toBeNull();
    // The controls the student actually needs are untouched.
    expect(screen.getByRole('button', { name: new RegExp(copy.player.play) })).toBeTruthy();
  });
});

describe('VideoLesson when YouTube never answers', () => {
  it('names the failure when the API script never arrives', async () => {
    loadYouTubeIframeApi.mockRejectedValue(new Error('blocked'));
    renderPlayer();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));

    expect(await screen.findByText(copy.player.videoBlockedByBrowser)).toBeTruthy();
    // The escape hatch: the lesson is still watchable somewhere.
    expect(screen.getByRole('link', { name: copy.player.videoOpenOnYouTube }).getAttribute('href')).toContain(
      VIDEO.youtubeId,
    );
  });

  /**
   * The half `onError` cannot see: the API loads from `youtube.com`, builds a
   * frame on `youtube-nocookie.com`, and the network drops only the second.
   * YouTube reports nothing at all, so before the watchdog this state was
   * permanent.
   */
  it('names the failure when the player is built but never becomes ready', async () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    // A constructor that takes the `onReady` callback and never calls it.
    loadYouTubeIframeApi.mockResolvedValue({
      Player: vi.fn(() => ({ destroy, getCurrentTime: () => 0, getDuration: () => 0, getPlayerState: () => -1, playVideo: vi.fn() })),
    });
    renderPlayer();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });

    // No `waitFor` here: it polls on the REAL clock, which the fake timers
    // above have replaced, so it would sit until the test times out. The
    // advance already flushed the watchdog and its render.
    expect(screen.getByText(copy.player.videoBlockedByBrowser)).toBeTruthy();
    // The dead frame is taken down with it, so «نجرّب تاني» starts clean.
    expect(destroy).toHaveBeenCalled();
  });

  it('leaves a player that does become ready alone', async () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    loadYouTubeIframeApi.mockResolvedValue({
      Player: vi.fn((_element: HTMLElement, options: { events?: { onReady?: (e: unknown) => void } }) => {
        const player = {
          destroy,
          getCurrentTime: () => 0,
          getDuration: () => 0,
          getPlayerState: () => 1,
          playVideo: vi.fn(),
          getIframe: () => document.createElement('iframe'),
        };
        queueMicrotask(() => options.events?.onReady?.({ target: player }));
        return player;
      }),
    });
    renderPlayer();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.queryByText(copy.player.videoBlockedByBrowser)).toBeNull();
    expect(destroy).not.toHaveBeenCalled();
  });
});
