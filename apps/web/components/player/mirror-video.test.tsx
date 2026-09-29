import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * hls.js, reduced to what `MirrorVideo` touches — and a record of the config
 * every instance was built with, because that config IS the fix for
 * «الفيديو بيلاج».
 */
const { FakeHls, built } = vi.hoisted(() => {
  const built: Record<string, unknown>[] = [];
  class FakeHls {
    static isSupported() {
      return true;
    }
    static Events = { MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched', ERROR: 'error' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    static ErrorDetails = { KEY_LOAD_ERROR: 'keyLoadError', KEY_LOAD_TIMEOUT: 'keyLoadTimeOut' };
    levels: { height: number }[] = [];
    currentLevel = -1;
    constructor(config: Record<string, unknown>) {
      built.push(config);
    }
    on() {}
    loadSource() {}
    attachMedia() {}
    startLoad() {}
    recoverMediaError() {}
    destroy() {}
  }
  return { FakeHls, built };
});

vi.mock('hls.js', () => ({ default: FakeHls }));

const { MirrorVideo, HLS_CONFIG } = await import('./mirror-video');

afterEach(() => {
  cleanup();
  built.length = 0;
});

function renderMirror() {
  return render(
    <MirrorVideo
      mirror={{ hlsUrl: 'https://video.example.test/v/abc/master.m3u8', maxHeight: 1080 }}
      title="How AI Works"
      posterUrl={null}
      startAt={0}
      onPlayer={() => {}}
      onFatal={() => {}}
      fullscreen={false}
      onToggleFullscreen={() => {}}
      watermark={null}
    />,
  );
}

describe('MirrorVideo playback tuning', () => {
  it('builds hls.js with the tuned config, not the library defaults', async () => {
    renderMirror();
    await act(async () => {});

    expect(built).toHaveLength(1);
    expect(built[0]).toBe(HLS_CONFIG);
    expect(built[0]).toMatchObject({
      startLevel: -1,
      capLevelToPlayerSize: true,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      backBufferLength: 30,
      startFragPrefetch: true,
    });
    // A realistic first guess for Egyptian mobile data, not hls.js's 500 kbps.
    expect(HLS_CONFIG.abrEwmaDefaultEstimate).toBeGreaterThanOrEqual(1_500_000);
    expect(HLS_CONFIG.abrEwmaDefaultEstimate).toBeLessThanOrEqual(2_000_000);
  });

  it('re-renders the bar once a second, not on every timeupdate', async () => {
    const { container } = renderMirror();
    await act(async () => {});
    const video = container.querySelector('video') as HTMLVideoElement;
    const seek = container.querySelector('input.mv-timeline') as HTMLInputElement;

    Object.defineProperty(video, 'duration', { value: 100, configurable: true });
    fireEvent.durationChange(video);
    for (const t of [12.1, 12.4, 12.8]) {
      Object.defineProperty(video, 'currentTime', { value: t, writable: true, configurable: true });
      fireEvent.timeUpdate(video);
    }

    // Held in whole seconds: three events inside one second are one value.
    expect(seek.value).toBe('12');
    expect(seek.getAttribute('aria-valuetext')).toBe('0:12 / 1:40');
  });
});
