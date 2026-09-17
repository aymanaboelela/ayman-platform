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
  provider: 'youtube',
  youtubeId: 'WndSPGcPmfM',
  durationSeconds: 3696,
  posterUrl: null,
  // No mirror: every test below is about the YouTube path, which is what a
  // lesson still falls back to when there is no copy of it on our origin.
  mirror: null,
};

/** The same lesson, mirrored. */
const MIRRORED: PlayerVideo = {
  ...VIDEO,
  mirror: { hlsUrl: 'https://video.example.test/v/WndSPGcPmfM/master.m3u8', maxHeight: 1080 },
};

/** A lecture uploaded to us — no YouTube id, because there is no YouTube video. */
const UPLOADED: PlayerVideo = {
  provider: 'upload',
  youtubeId: null,
  durationSeconds: 3696,
  posterUrl: null,
  mirror: {
    hlsUrl: 'https://video.example.test/v/0123456789abcdef0123456789abcdef/master.m3u8',
    maxHeight: 1080,
  },
};

/** The same upload, while the encoder still has it. */
const PROCESSING: PlayerVideo = { ...UPLOADED, mirror: null };

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
  it('falls back to a plain embed when the API script never arrives', async () => {
    loadYouTubeIframeApi.mockRejectedValue(new Error('blocked'));
    renderPlayer();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));

    // The API script is on far more blocklists than YouTube itself, so a
    // student who loses it can usually still watch the video.
    const frame = (await screen.findByTitle('How AI Works')) as HTMLIFrameElement;
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.src).toContain(`/embed/${VIDEO.youtubeId}`);
    // NOT the nocookie host: repeating the host that just failed would be a
    // retry, not a different attempt.
    expect(frame.src).toContain('www.youtube.com');

    expect(screen.getByText(new RegExp(copy.player.videoFallbackNote.slice(0, 20)))).toBeTruthy();
    // The last resort is still one tap away.
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
  it('falls back to a plain embed when the player is built but never becomes ready', async () => {
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
    const frame = screen.getByTitle('How AI Works') as HTMLIFrameElement;
    expect(frame.src).toContain(`/embed/${VIDEO.youtubeId}`);
    // The dead API frame is taken down first, so the two never both exist.
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

    expect(screen.queryByTitle('How AI Works')).toBeNull();
    expect(destroy).not.toHaveBeenCalled();
  });
});

/**
 * The whole point of «النسخة اللي عندنا».
 *
 * A student on a ministry tablet has YouTube blocked at the NETWORK. That
 * failure is a silence — no `onError`, no `script.onerror`, nothing for a
 * fallback chain to react to — so a player that reaches for YouTube first and
 * our copy second would leave those students exactly where they were. The
 * order is the feature; these assert it rather than the plumbing.
 */
describe('VideoLesson with a mirror', () => {
  /**
   * jsdom reports it can play nothing, which would send every test down the
   * hls.js branch and out again through `onFatal` (there is no Media Source
   * Extensions here either) — the component would fall back to YouTube and
   * the assertions below would pass for entirely the wrong reason.
   *
   * Claiming native HLS is the Safari path, and it is also the honest one to
   * test in jsdom: no library, the element plays the playlist itself.
   */
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'application/vnd.apple.mpegurl' ? 'probably' : '',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderMirrored() {
    return render(
      <VideoLesson
        lessonId="0198c3a2-0000-7000-8000-000000000001"
        video={MIRRORED}
        title="How AI Works"
        resumeAt={0}
        onProgress={() => {}}
        onError={() => {}}
      />,
    );
  }

  it('never asks YouTube for anything when we have our own copy', async () => {
    renderMirrored();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {});

    // Not "loaded and then ignored" — never requested. On a blocked network
    // that request is the thing that hangs.
    expect(loadYouTubeIframeApi).not.toHaveBeenCalled();
  });

  it('plays from our origin, not from youtube.com', async () => {
    const { container } = renderMirrored();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {});

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe(MIRRORED.mirror?.hlsUrl);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('still shows the poster until the student presses play', () => {
    // A mirrored lesson must not start fetching a playlist on page load — the
    // students this is for are on school data, and an outline they scrolled
    // past is not a lesson they opened.
    const { container } = renderMirrored();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(copy.player.play) })).toBeTruthy();
  });

  /* ── الرفع المباشر ─────────────────────────────────────────────────────
   *
   * A lecture uploaded to us exists on our origin and NOWHERE else. Every
   * YouTube affordance the component grew over its first year is a promise of
   * a video that was never uploaded there, so each one has to be absent —
   * not merely unused.
   */

  function renderUpload(video: PlayerVideo) {
    return render(
      <VideoLesson
        lessonId="0198c3a2-0000-7000-8000-000000000001"
        video={video}
        title="How AI Works"
        resumeAt={0}
        onProgress={() => {}}
        onError={() => {}}
      />,
    );
  }

  it('plays an uploaded lecture from our origin', async () => {
    const { container } = renderUpload(UPLOADED);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {});

    expect(container.querySelector('video')?.getAttribute('src')).toBe(UPLOADED.mirror?.hlsUrl);
    expect(loadYouTubeIframeApi).not.toHaveBeenCalled();
  });

  it('offers no YouTube link anywhere for an uploaded lecture', async () => {
    const { container } = renderUpload(UPLOADED);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {});

    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((href) => href.includes('youtube.com'))).toBe(false);
  });

  /*
   * The window right after an instructor uploads. Before this branch existed
   * the poster showed an ordinary play button over a playlist URL that 404s,
   * which is the spinning grey box this whole feature was built to end —
   * reintroduced, for the few minutes the encoder needs.
   */
  it('says the lecture is being prepared instead of offering a dead play button', () => {
    renderUpload(PROCESSING);
    expect(screen.getByText(copy.player.videoProcessing)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(copy.player.play) })).toBeNull();
  });

  it('does not fetch anything while the lecture is still being prepared', async () => {
    const { container } = renderUpload(PROCESSING);
    await act(async () => {});
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(loadYouTubeIframeApi).not.toHaveBeenCalled();
  });
});

/**
 * «الشاشة تقلب وتتلف كده شبه يوتيوب».
 *
 * Two separate things had to be true and only one of them is fullscreen:
 * before this, `F` was the only way in, and a phone — the device where a 16:9
 * strip across a portrait screen actually hurts — has no F key at all.
 *
 * Each case asserts the EFFECT on the browser APIs the feature exists to
 * drive, because a button that opens fullscreen without rotating is exactly
 * the "it works and the video is still small" complaint being fixed.
 */
describe('VideoLesson fullscreen control', () => {
  let requestFullscreen: ReturnType<typeof vi.fn>;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let lock: ReturnType<typeof vi.fn>;
  let unlock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requestFullscreen = vi.fn(() => Promise.resolve());
    exitFullscreen = vi.fn(() => Promise.resolve());
    lock = vi.fn(() => Promise.resolve());
    unlock = vi.fn();

    Element.prototype.requestFullscreen = requestFullscreen as unknown as Element['requestFullscreen'];
    Object.defineProperty(document, 'exitFullscreen', { value: exitFullscreen, configurable: true });
    Object.defineProperty(document, 'fullscreenElement', { value: null, writable: true, configurable: true });
    // ⚠️ `window.screen`, NOT the bare `screen` — that name is already bound to
    // Testing Library's query object at the top of this file, so defining
    // `orientation` on it would decorate the wrong thing and the assertions
    // below would fail against a feature that works.
    Object.defineProperty(window.screen, 'orientation', {
      value: { lock, unlock },
      writable: true,
      configurable: true,
    });

    loadYouTubeIframeApi.mockResolvedValue({
      Player: vi.fn((_mount: unknown, options: { events?: { onReady?: (e: unknown) => void } }) => {
        const player = { destroy: vi.fn(), getCurrentTime: () => 0, getDuration: () => 100, getPlayerState: () => 1, playVideo: vi.fn() };
        options.events?.onReady?.({ target: player });
        return player;
      }),
    });
  });

  async function play() {
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    return screen.findByRole('button', { name: copy.player.enterFullscreen });
  }

  it('shows no fullscreen button until the video has actually started', () => {
    // Over the poster it would sit on «شغّل الفيديو» and steal the tap that
    // starts the lesson.
    renderPlayer();
    expect(screen.queryByRole('button', { name: copy.player.enterFullscreen })).toBeNull();
  });

  it('turns the phone sideways as well as filling the screen', async () => {
    const button = await play();
    await act(async () => {
      fireEvent.click(button);
    });

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('still goes fullscreen on a browser that cannot rotate', async () => {
    // iOS Safari has no `lock` at all, and a desktop rejects it. Neither is
    // something the student can act on, and neither may cost them fullscreen.
    Object.defineProperty(window.screen, 'orientation', { value: {}, writable: true, configurable: true });
    const button = await play();
    await act(async () => {
      fireEvent.click(button);
    });

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('releases the rotation on the way out, while the lock is still ours', async () => {
    const button = await play();
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, writable: true, configurable: true });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(unlock).toHaveBeenCalledTimes(1);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
