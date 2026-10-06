import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function renderPlayer({ resumeAt = 0, watermark = null }: { resumeAt?: number; watermark?: string | null } = {}) {
  return render(
    <VideoLesson
      lessonId="0198c3a2-0000-7000-8000-000000000001"
      video={VIDEO}
      title="How AI Works"
      resumeAt={resumeAt}
      onProgress={() => {}}
      onError={() => {}}
      watermark={watermark}
    />,
  );
}

interface FakeEvents {
  onReady?: (event: { target: unknown }) => void;
  onStateChange?: (event: { data: number; target: unknown }) => void;
}

/**
 * The IFrame API, as much of it as the shield's bar drives.
 *
 * Like the real one it REPLACES the node it is handed with its own frame, so
 * the frame ends up where the real one does: inside the shell, before the
 * layers drawn over it. And like the real one it answers `onReady` LATER, never
 * from inside the constructor — the watchdog is armed after construction, and
 * a synchronous `onReady` would find nothing to disarm.
 */
function fakeYouTube({ ready = 'soon' }: { ready?: 'soon' | 'never' } = {}) {
  const frame = document.createElement('iframe');
  let events: FakeEvents = {};
  let playerVars: Record<string, unknown> = {};
  const player = {
    destroy: vi.fn(),
    getCurrentTime: vi.fn(() => 42),
    getDuration: vi.fn(() => 3696),
    getPlayerState: vi.fn(() => 1),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    getVideoLoadedFraction: vi.fn(() => 0.1),
    getPlaybackRate: vi.fn(() => 1),
    setPlaybackRate: vi.fn(),
    getAvailablePlaybackRates: vi.fn(() => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]),
    getVolume: vi.fn(() => 100),
    setVolume: vi.fn(),
    isMuted: vi.fn(() => false),
    mute: vi.fn(),
    unMute: vi.fn(),
    // Captions: none, unless a test says otherwise.
    getOptions: vi.fn((): string[] => []),
    loadModule: vi.fn(),
    unloadModule: vi.fn(),
    getIframe: () => frame,
  };
  const Player = vi.fn(
    (mount: HTMLElement, options: { playerVars?: Record<string, unknown>; events?: FakeEvents }) => {
      events = options.events ?? {};
      playerVars = options.playerVars ?? {};
      // The real API carries the class across onto its frame.
      frame.className = mount.className;
      mount.replaceWith(frame);
      if (ready === 'soon') queueMicrotask(() => events.onReady?.({ target: player }));
      return player;
    },
  );
  loadYouTubeIframeApi.mockResolvedValue({ Player });
  return {
    player,
    frame,
    playerVars: () => playerVars,
    /** YouTube reporting a state change, the way `onStateChange` does. */
    emit: (state: number) => act(() => events.onStateChange?.({ data: state, target: player })),
  };
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
    const { player } = fakeYouTube();
    const destroy = player.destroy;
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

    // `src` lands after the dynamic `import('hls.js')` settles — one flush is
    // enough on an idle machine and not under a full parallel run.
    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe(MIRRORED.mirror?.hlsUrl));
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

    fakeYouTube();
  });

  /**
   * The button in the shield's bar. Waiting for the bar first, because while
   * the frame loads the corner control stands in for it — and a test holding
   * THAT one would be clicking a button that has since left the page.
   */
  async function play() {
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await screen.findByRole('region', { name: 'How AI Works' });
    return screen.getByRole('button', { name: copy.player.enterFullscreen });
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

/**
 * «شيلها من الفيديوهات اللي بتتعرض يوتيوب».
 *
 * The embed's own UI — the copy-link button in the corner, the title, the
 * logo, the right-click menu — handed any student the video's address. The
 * shield answers with three things, and each is asserted by its EFFECT:
 * YouTube is asked to draw no controls, a layer of ours covers the whole
 * frame and swallows what lands on it, and every control a student still
 * needs is ours, calling the IFrame API.
 */
describe('VideoLesson YouTube shield', () => {
  const c = copy.player.controls;

  async function play(options?: Parameters<typeof renderPlayer>[0]) {
    const view = renderPlayer(options);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await screen.findByRole('region', { name: 'How AI Works' });
    return view;
  }

  it('asks YouTube for no controls, no keyboard and no cards — and keeps the rest', async () => {
    const yt = fakeYouTube();
    await play({ resumeAt: 600 });

    expect(yt.playerVars()).toMatchObject({
      controls: 0,
      disablekb: 1,
      iv_load_policy: 3,
      rel: 0,
      playsinline: 1,
      hl: 'ar',
      // The resume still lands: 600 minus the five-second rewind.
      start: 595,
    });
  });

  it('covers the whole frame with a layer that takes every tap and swallows the context menu', async () => {
    const yt = fakeYouTube();
    const { container } = await play();

    const region = screen.getByRole('region', { name: 'How AI Works' });
    // Over the frame: a later sibling in the same shell, stretched edge to
    // edge, and nothing on it lets events fall through.
    expect(region.parentElement).toBe(yt.frame.parentElement);
    expect(yt.frame.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.className).toContain('inset-0');
    expect(region.className).not.toContain('pointer-events-none');

    const surface = container.querySelector('[data-player-surface]') as HTMLElement;
    expect(surface.className).toContain('inset-0');
    // `fireEvent` returns false when a handler called `preventDefault()`:
    // YouTube's «نسخ عنوان URL للفيديو» menu, and the browser's, never open.
    expect(fireEvent.contextMenu(surface)).toBe(false);
    expect(fireEvent.contextMenu(region)).toBe(false);
  });

  it('takes the frame out of the keyboard\'s reach too', async () => {
    const yt = fakeYouTube();
    await play();

    // Tab would otherwise walk into YouTube's title link and copy-link button.
    expect(yt.frame.tabIndex).toBe(-1);
    expect(yt.frame.inert).toBe(true);
  });

  it('drives the video through the IFrame API from its own buttons', async () => {
    const yt = fakeYouTube();
    await play();
    // YouTube says it is playing, so the bar offers «إيقاف مؤقت».
    yt.emit(1);

    fireEvent.click(screen.getByRole('button', { name: c.pause }));
    expect(yt.player.pauseVideo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole('button', { name: c.play })[0] as HTMLElement);
    expect(yt.player.playVideo).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: c.forward }));
    expect(yt.player.seekTo).toHaveBeenLastCalledWith(52, true);
    // From where the +10 is GOING, not from the playhead the frame has not
    // updated yet — so back after forward lands where it started.
    fireEvent.click(screen.getByRole('button', { name: c.back }));
    expect(yt.player.seekTo).toHaveBeenLastCalledWith(42, true);

    fireEvent.change(screen.getByRole('slider', { name: c.seek }), { target: { value: '1800' } });
    expect(yt.player.seekTo).toHaveBeenLastCalledWith(1800, true);

    fireEvent.click(screen.getByRole('button', { name: c.mute }));
    expect(yt.player.mute).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: c.settings }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '1.5x' }));
    expect(yt.player.setPlaybackRate).toHaveBeenCalledWith(1.5);
  });

  it('offers no quality menu when the player cannot pin one — none is faked', async () => {
    fakeYouTube();
    await play();

    fireEvent.click(screen.getByRole('button', { name: c.settings }));
    expect(screen.queryByText(c.quality)).toBeNull();
  });

  it('offers no speed menu for a video that plays at one speed only', async () => {
    const yt = fakeYouTube();
    yt.player.getAvailablePlaybackRates.mockReturnValue([1]);
    await play();

    expect(screen.queryByRole('button', { name: c.settings })).toBeNull();
  });

  it('draws the student\'s name over YouTube\'s picture as well', async () => {
    fakeYouTube();
    const { container } = await play({ watermark: 'Student Name · 01000000000' });

    const mark = container.querySelector('.mv-watermark');
    expect(mark?.textContent).toBe('Student Name · 01000000000');
  });

  it('keeps its own fullscreen button in the bar, not the corner one', async () => {
    fakeYouTube();
    await play();

    // Exactly one: the bar's. The corner control was for a frame with a bar
    // of its own, and two identical buttons would be one too many.
    expect(screen.getAllByRole('button', { name: copy.player.enterFullscreen })).toHaveLength(1);
  });

  /*
   * The iPhone case. It will not start an embed from script until the frame
   * itself has been touched — and the shield exists so it cannot be. Without
   * a way through, every iPhone student would face a lecture that never
   * starts.
   */
  it('opens a hole over YouTube\'s own play button when a play never starts, and closes it once it does', async () => {
    vi.useFakeTimers();
    const yt = fakeYouTube();
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const region = screen.getByRole('region', { name: 'How AI Works' });
    expect(region.className).not.toContain('pc-keyhole');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(region.className).toContain('pc-keyhole');
    // An inert frame takes no tap even through a hole.
    expect(yt.frame.inert).toBe(false);

    yt.emit(1);
    expect(region.className).not.toContain('pc-keyhole');
    expect(yt.frame.inert).toBe(true);
  });

  it('never opens the hole where the play simply works', async () => {
    vi.useFakeTimers();
    const yt = fakeYouTube();
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    yt.emit(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(screen.getByRole('region', { name: 'How AI Works' }).className).not.toContain('pc-keyhole');
  });

  it('covers the frame while it is still loading, before there is an API to drive', async () => {
    fakeYouTube({ ready: 'never' });
    const { container } = renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {});

    const glass = container.querySelector('[data-player-glass]') as HTMLElement | null;
    expect(glass).not.toBeNull();
    expect(glass?.className).toContain('inset-0');
    expect(fireEvent.contextMenu(glass as HTMLElement)).toBe(false);
  });

  it('leaves the plain-embed fallback unshielded, because nothing could drive it', async () => {
    loadYouTubeIframeApi.mockRejectedValue(new Error('blocked'));
    const { container } = renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));

    const frame = (await screen.findByTitle('How AI Works')) as HTMLIFrameElement;
    // YouTube's own controls are the only ones this frame has.
    expect(frame.src).not.toContain('controls=0');
    expect(screen.queryByRole('region', { name: 'How AI Works' })).toBeNull();
    expect(container.querySelector('[data-player-glass]')).toBeNull();
  });
});

describe('VideoLesson keyboard and timeline, YouTube-style', () => {
  const c = copy.player.controls;

  async function play() {
    const yt = fakeYouTube();
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await screen.findByRole('region', { name: 'How AI Works' });
    yt.emit(1);
    return yt;
  }

  it('pauses on Space with focus on the page — the poster that had it is gone', async () => {
    const yt = await play();
    (document.activeElement as HTMLElement | null)?.blur();

    // `false`: the page did not scroll instead.
    expect(fireEvent.keyDown(document.body, { code: 'Space' })).toBe(false);
    expect(yt.player.pauseVideo).toHaveBeenCalledTimes(1);
  });

  it('seeks on the arrows even with a bar button focused', async () => {
    const yt = await play();
    const mute = screen.getByRole('button', { name: c.mute });
    mute.focus();

    fireEvent.keyDown(mute, { code: 'ArrowRight' });
    expect(yt.player.seekTo).toHaveBeenLastCalledWith(47, true);
    fireEvent.keyDown(mute, { code: 'KeyL' });
    expect(yt.player.seekTo).toHaveBeenLastCalledWith(57, true);
    // Space over a focused button is play/pause, not a press of that button.
    fireEvent.keyDown(mute, { code: 'Space' });
    expect(yt.player.pauseVideo).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyUp(mute, { code: 'Space' })).toBe(false);
    expect(yt.player.mute).not.toHaveBeenCalled();
  });

  it('leaves the keys to a field being typed in elsewhere on the page', async () => {
    const yt = await play();
    const answer = document.createElement('textarea');
    document.body.append(answer);

    expect(fireEvent.keyDown(answer, { code: 'Space' })).toBe(true);
    fireEvent.keyDown(answer, { code: 'ArrowLeft' });
    expect(yt.player.pauseVideo).not.toHaveBeenCalled();
    expect(yt.player.seekTo).not.toHaveBeenCalled();
    answer.remove();
  });

  it('seeks ONCE when a drag along the timeline is let go, not on every step of it', async () => {
    const yt = await play();
    const seek = screen.getByRole('slider', { name: c.seek }) as HTMLInputElement;

    fireEvent.pointerDown(seek);
    for (const value of ['600', '900', '1200', '1500']) fireEvent.change(seek, { target: { value } });
    expect(yt.player.seekTo).not.toHaveBeenCalled();
    // The thumb follows the finger meanwhile.
    expect(seek.value).toBe('1500');

    fireEvent.pointerUp(window);
    expect(yt.player.seekTo).toHaveBeenCalledTimes(1);
    expect(yt.player.seekTo).toHaveBeenLastCalledWith(1500, true);
  });
});

/**
 * The bar moved out of `mirror-video.tsx` into `player-chrome.tsx` so both
 * sources wear it. Our own copy is the one that had it first — these hold it
 * to what it did before the move.
 */
describe('VideoLesson our own copy, after the bar moved out', () => {
  const c = copy.player.controls;

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'application/vnd.apple.mpegurl' ? 'probably' : '',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still draws its bar, its speeds and the name over the picture', async () => {
    const { container } = render(
      <VideoLesson
        lessonId="0198c3a2-0000-7000-8000-000000000001"
        video={MIRRORED}
        title="How AI Works"
        resumeAt={0}
        onProgress={() => {}}
        onError={() => {}}
        watermark="Student Name"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {});

    const region = screen.getByRole('region', { name: 'How AI Works' });
    expect(region.querySelector('video')).not.toBeNull();
    expect(region.className).toContain('bg-black');
    expect(container.querySelector('.mv-watermark')?.textContent).toBe('Student Name');
    expect(fireEvent.contextMenu(region)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: c.settings }));
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      '0.75x',
      c.speedNormal,
      '1.25x',
      '1.5x',
      '1.75x',
      '2x',
    ]);
  });
});

/**
 * «عاوز هنا يبقى الصورة اللي أنا حاطّاها، ولما أضغط عليها الفيديو يشتغل على
 * طول».
 *
 * An uploaded lecture showed a grey box before play, and the tap on it only
 * mounted a player that then wanted a second tap. Both halves are asserted by
 * what the student sees and what the element is asked to do.
 */
describe('VideoLesson uploaded lecture poster and one-tap play', () => {
  const ENCODER_FRAME = 'https://video.example.test/v/0123456789abcdef0123456789abcdef/poster.jpg';
  let play: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'application/vnd.apple.mpegurl' ? 'probably' : '',
    );
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('shows the teacher\'s picture, and the encoder\'s frame when that one will not load', () => {
    const { container } = renderUpload({ ...UPLOADED, posterUrl: 'https://media.example.test/media/poster.webp' });

    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://media.example.test/media/poster.webp');
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    // Not a grey box: the frame the encoder cut beside the playlist.
    expect(container.querySelector('img')?.getAttribute('src')).toBe(ENCODER_FRAME);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    // Only when both fail does the poster give up on pictures.
    expect(container.querySelector('img')).toBeNull();
  });

  it('uses the encoder\'s frame when the teacher set no picture at all', () => {
    const { container } = renderUpload(UPLOADED);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(ENCODER_FRAME);
  });

  it('asks the video to play inside the tap itself — no second press', () => {
    const { container } = renderUpload(UPLOADED);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));

    // Synchronously, before anything is awaited: the element is already on
    // the page and `play()` was called while the tap was being handled, which
    // is what the browser needs to see to allow sound.
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.contexts[0]).toBe(video);
  });

  it('falls back to the big play disc when the browser refuses anyway', async () => {
    play.mockImplementation(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    renderUpload(UPLOADED);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {});

    // Nothing thrown, nothing stuck: the element stayed paused, so the bar's
    // own play control is there for the second tap.
    expect(screen.getAllByRole('button', { name: copy.player.controls.play }).length).toBeGreaterThan(0);
  });
});

/**
 * «عاوز لما أكبّر الفيديو يكبّر الشاشة كلها شبه يوتيوب».
 */
describe('VideoLesson fullscreen covers the whole screen', () => {
  const original = Element.prototype.requestFullscreen;

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'application/vnd.apple.mpegurl' ? 'probably' : '',
    );
    Object.defineProperty(document, 'fullscreenElement', { value: null, writable: true, configurable: true });
  });

  afterEach(() => {
    Element.prototype.requestFullscreen = original;
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-player-fullscreen');
  });

  async function playUpload() {
    const view = render(
      <VideoLesson
        lessonId="0198c3a2-0000-7000-8000-000000000001"
        video={UPLOADED}
        title="How AI Works"
        resumeAt={0}
        onProgress={() => {}}
        onError={() => {}}
        watermark="Student Name"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {});
    const region = screen.getByRole('region', { name: 'How AI Works' });
    return { ...view, region, shell: region.parentElement as HTMLElement };
  }

  it('asks for real fullscreen on the player\'s own container, with the bar and the name inside it', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    Element.prototype.requestFullscreen = requestFullscreen as unknown as Element['requestFullscreen'];
    const { shell } = await playUpload();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.player.enterFullscreen }));
    });

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    // The container — not the <video>, whose own fullscreen drops everything
    // drawn over the picture.
    expect(requestFullscreen.mock.contexts[0]).toBe(shell);
    expect(shell.querySelector('.mv-watermark')).not.toBeNull();
    expect(shell.querySelector('[role="region"]')).not.toBeNull();
  });

  it('pins itself over the screen when the browser refuses real fullscreen', async () => {
    Element.prototype.requestFullscreen = vi.fn(() =>
      Promise.reject(new Error('denied')),
    ) as unknown as Element['requestFullscreen'];
    const { shell } = await playUpload();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.player.enterFullscreen }));
    });

    // An in-app browser used to make this a button that did nothing.
    expect(shell.className).toContain('fixed');
    expect(document.documentElement.hasAttribute('data-player-fullscreen')).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.player.exitFullscreen }));
    });
    expect(shell.className).not.toContain('fixed');
    expect(document.documentElement.hasAttribute('data-player-fullscreen')).toBe(false);
  });

  it('pins itself over the screen on an iPhone, and lets the page go on Escape', async () => {
    // No Fullscreen API for a <div> at all.
    Element.prototype.requestFullscreen = undefined as unknown as Element['requestFullscreen'];
    const { shell } = await playUpload();

    fireEvent.click(screen.getByRole('button', { name: copy.player.enterFullscreen }));
    expect(shell.className).toContain('fixed');
    // The attribute `globals.css` reads to take `.route-fade`'s transform —
    // the containing block that kept the pinned player inside the page
    // column — out of the way.
    expect(document.documentElement.hasAttribute('data-player-fullscreen')).toBe(true);

    fireEvent.keyDown(document, { code: 'Escape' });
    expect(shell.className).not.toContain('fixed');
    expect(document.documentElement.hasAttribute('data-player-fullscreen')).toBe(false);
  });

  it('moves the name with a transform, not with top/left', async () => {
    const { shell } = await playUpload();
    const mark = shell.querySelector('.mv-watermark') as HTMLElement;

    expect(mark.style.transform).toMatch(/^translate\(/);
    expect(mark.style.insetBlockStart).toBe('');
    expect(mark.style.insetInlineStart).toBe('');
  });
});

describe('VideoLesson YouTube captions toggle', () => {
  const c = copy.player.controls;

  afterEach(() => {
    vi.useRealTimers();
  });

  async function playWith(yt: ReturnType<typeof fakeYouTube>) {
    vi.useFakeTimers();
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // One poll of the player.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    return yt;
  }

  it('offers a captions button only for a video that has captions, and starts it off', async () => {
    const yt = fakeYouTube();
    yt.player.getOptions.mockReturnValue(['captions']);
    await playWith(yt);

    // A video whose uploader turned captions on by default used to show them
    // with no way to hide them. They start hidden now; the button shows them.
    expect(yt.player.unloadModule).toHaveBeenCalledWith('captions');
    const show = screen.getByRole('button', { name: c.captionsShow });

    fireEvent.click(show);
    expect(yt.player.loadModule).toHaveBeenCalledWith('captions');
    fireEvent.click(screen.getByRole('button', { name: c.captionsHide }));
    expect(yt.player.unloadModule).toHaveBeenCalledTimes(2);
  });

  it('crops YouTube\'s edges off the frame, and uncrops it while captions show', async () => {
    const yt = fakeYouTube();
    yt.player.getOptions.mockReturnValue(['captions']);
    await playWith(yt);

    // Taller than the box: the title bar and the logo strip land outside it.
    expect(yt.frame.className).toContain('top-[-25%]');
    expect(yt.frame.className).toContain('h-[150%]');

    // YouTube pins captions to the same bottom edge, so they need the whole frame.
    fireEvent.click(screen.getByRole('button', { name: c.captionsShow }));
    expect(yt.frame.className).toBe('absolute inset-0 h-full w-full');
    fireEvent.click(screen.getByRole('button', { name: c.captionsHide }));
    expect(yt.frame.className).toContain('top-[-25%]');
  });

  it('draws no captions button for a video without any', async () => {
    const yt = fakeYouTube();
    await playWith(yt);

    expect(screen.queryByRole('button', { name: c.captionsShow })).toBeNull();
    expect(yt.player.unloadModule).not.toHaveBeenCalled();
  });
});

describe('VideoLesson YouTube quality menu', () => {
  const c = copy.player.controls;

  afterEach(() => {
    vi.useRealTimers();
  });

  async function playWith(yt: ReturnType<typeof fakeYouTube>) {
    vi.useFakeTimers();
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(copy.player.play) }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    return yt;
  }

  function withQuality(yt: ReturnType<typeof fakeYouTube>) {
    const setPlaybackQualityRange = vi.fn();
    Object.assign(yt.player, {
      getAvailableQualityLevels: vi.fn(() => ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny', 'auto']),
      getPlaybackQuality: vi.fn(() => 'hd720'),
      setPlaybackQualityRange,
    });
    return setPlaybackQualityRange;
  }

  it('lists the levels the video has, tallest first, and shows the current one', async () => {
    const yt = fakeYouTube();
    withQuality(yt);
    await playWith(yt);

    fireEvent.click(screen.getByRole('button', { name: c.settings }));
    const items = screen.getAllByRole('menuitemradio').filter((el) => /^\d+p$/.test(el.textContent ?? ''));
    expect(items.map((el) => el.textContent)).toEqual(['1080p', '720p', '480p', '360p', '240p']);
    expect(screen.getByRole('menuitemradio', { name: '720p' }).getAttribute('aria-checked')).toBe('true');
  });

  it('pins the level it is asked for, both ends of the range', async () => {
    const yt = fakeYouTube();
    const pin = withQuality(yt);
    await playWith(yt);

    fireEvent.click(screen.getByRole('button', { name: c.settings }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '360p' }));
    // A one-sided range is a hint YouTube ignores.
    expect(pin).toHaveBeenCalledWith('medium', 'medium');
  });
});
