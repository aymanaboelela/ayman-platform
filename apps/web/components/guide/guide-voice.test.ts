import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { guideCopy, type GuideVoiceKey } from '@ayman/contracts/copy/guide';
import {
  GUIDE_MUTED_KEY,
  VOICE_KEYS,
  createVoicePlayer,
  voiceSrc,
  type VoiceAudio,
} from './guide-voice';

const WEB = resolve(import.meta.dirname, '..', '..');
const REPO = resolve(WEB, '..', '..');
const SCRIPT_KEYS = Object.keys(guideCopy.voice) as GuideVoiceKey[];

describe('the recording script', () => {
  it('uses keys that are safe as file names', () => {
    for (const key of SCRIPT_KEYS) expect(key).toMatch(/^[a-z0-9-]+$/);
  });

  it('has a clip on disk for every line, and no clip without a line', () => {
    const clips = readdirSync(join(WEB, 'public', 'guide-voice'))
      .filter((file) => file.endsWith('.mp3'))
      .map((file) => file.replace(/\.mp3$/, ''))
      .sort();
    expect(clips).toEqual([...SCRIPT_KEYS].sort());
  });

  it('matches the script that was handed to the recording, word for word', () => {
    // `docs/guide-voice/voice-lines.json` is what the clips were generated
    // from. A line reworded here without re-recording plays one sentence
    // while the screen shows another — so the two are held together.
    const recorded = JSON.parse(
      readFileSync(join(REPO, 'docs', 'guide-voice', 'voice-lines.json'), 'utf8'),
    ) as Record<string, string>;
    const script = Object.fromEntries(
      SCRIPT_KEYS.map((key) => [key, guideCopy.voice[key].replace('{name}', copy.site.instructor)]),
    );
    expect(recorded).toEqual(script);
  });

  it('carries one placeholder in the whole script — the teacher’s name', () => {
    const withPlaceholder = SCRIPT_KEYS.filter((key) => /\{\w+\}/.test(guideCopy.voice[key]));
    expect(withPlaceholder).toEqual(['welcome']);
    expect(guideCopy.voice.welcome).toContain('{name}');
  });

  it('keeps every line to one breath', () => {
    for (const key of SCRIPT_KEYS) expect(guideCopy.voice[key].length, key).toBeLessThanOrEqual(160);
  });

  it('is never imported by shipped code', () => {
    // The recorded script names the original instructor. It lives in `docs/`
    // so no bundle can carry it; a module importing it would ship his name to
    // every stack's browser.
    for (const file of readdirSync(join(WEB, 'components', 'guide'))) {
      if (/\.test\.tsx?$/.test(file)) continue;
      expect(readFileSync(join(WEB, 'components', 'guide', file), 'utf8'), file).not.toMatch(
        /from ['"][^'"]*voice-lines\.json['"]/,
      );
    }
  });
});

describe('the manifest', () => {
  it('treats every line of the script as recorded, on the original stack', () => {
    expect([...VOICE_KEYS].sort()).toEqual([...SCRIPT_KEYS].sort());
    expect(voiceSrc('register-name')).toBe('/guide-voice/register-name.mp3');
  });

  it('has no clip to offer a stack with no recordings', () => {
    expect(voiceSrc('welcome', new Set())).toBeNull();
  });
});

/** Stands in for `HTMLAudioElement`, recording what the player did to it. */
function fakeAudio(play: () => Promise<void> = () => Promise.resolve()) {
  const listeners: Record<string, Set<() => void>> = { ended: new Set(), error: new Set() };
  const audio = {
    preload: 'auto',
    src: '',
    currentTime: 5,
    play: vi.fn(play),
    pause: vi.fn(),
    addEventListener: (type: 'ended' | 'error', listener: () => void) => listeners[type]!.add(listener),
    removeEventListener: (type: 'ended' | 'error', listener: () => void) => listeners[type]!.delete(listener),
    removeAttribute: vi.fn((name: string) => {
      if (name === 'src') audio.src = '';
    }),
    emit: (type: 'ended' | 'error') => {
      for (const listener of [...listeners[type]!]) listener();
    },
    listenerCount: () => listeners.ended!.size + listeners.error!.size,
  };
  return audio;
}

const flush = () => new Promise((done) => setTimeout(done, 0));

describe('the player', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function setup(play?: () => Promise<void>, keys?: ReadonlySet<GuideVoiceKey>) {
    const audio = fakeAudio(play);
    const createAudio = vi.fn(() => audio as unknown as VoiceAudio);
    const player = createVoicePlayer({ createAudio, storage: window.localStorage, keys });
    return { audio, createAudio, player };
  }

  it('creates no audio element and fetches nothing until a line is played', () => {
    const { createAudio, player } = setup();
    player.say('welcome');
    expect(createAudio).not.toHaveBeenCalled();
    expect(player.snapshot().playing).toBeNull();
  });

  it('never speaks before the student has touched the guide', () => {
    const { audio, player } = setup();
    player.say('welcome');
    player.say('year');
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('speaks a new line by itself once the guide has been touched', async () => {
    const { audio, player } = setup();
    player.unlock();
    player.say('year');
    await flush();
    expect(audio.preload).toBe('none');
    expect(audio.src).toBe('/guide-voice/year.mp3');
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(player.snapshot().playing).toBe('year');
  });

  it('reuses ONE element and loads only the clip it is about to play', async () => {
    const { audio, createAudio, player } = setup();
    player.unlock();
    player.say('year');
    player.say('stream');
    await flush();
    expect(createAudio).toHaveBeenCalledTimes(1);
    // The earlier clip is stopped, not layered under the new one.
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('/guide-voice/stream.mp3');
    expect(player.snapshot().playing).toBe('stream');
  });

  it('stops on a step with nothing to say', async () => {
    const { audio, player } = setup();
    player.unlock();
    player.say('year');
    await flush();
    player.say(null);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(0);
    expect(player.snapshot().playing).toBeNull();
  });

  it('plays from the button without waiting to be unlocked, and stops on a second press', async () => {
    const { audio, player } = setup();
    player.toggle('welcome');
    await flush();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(player.snapshot().playing).toBe('welcome');
    player.toggle('welcome');
    expect(player.snapshot().playing).toBeNull();
  });

  it('remembers «muted» across visits and stays silent while muted', async () => {
    const first = setup();
    first.player.unlock();
    first.player.say('year');
    await flush();
    first.player.setMuted(true);
    expect(first.player.snapshot()).toEqual({ playing: null, muted: true });
    expect(window.localStorage.getItem(GUIDE_MUTED_KEY)).toBe('1');

    const next = setup();
    expect(next.player.snapshot().muted).toBe(true);
    next.player.unlock();
    next.player.say('stream');
    await flush();
    expect(next.audio.play).not.toHaveBeenCalled();
  });

  it('un-mutes when the student presses play — that is asking to hear it', async () => {
    window.localStorage.setItem(GUIDE_MUTED_KEY, '1');
    const { audio, player } = setup();
    player.toggle('plan');
    await flush();
    expect(player.snapshot()).toEqual({ playing: 'plan', muted: false });
    expect(window.localStorage.getItem(GUIDE_MUTED_KEY)).toBeNull();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('falls back to text when the browser refuses to play, without retrying', async () => {
    const { audio, player } = setup(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')));
    player.unlock();
    player.say('year');
    await flush();
    expect(player.snapshot().playing).toBeNull();
    expect(audio.play).toHaveBeenCalledTimes(1);
    // Refused is not broken: the button is still worth pressing.
    expect(player.canPlay('year')).toBe(true);
  });

  it('falls back to text for a clip that is missing, and stops offering it', async () => {
    const { audio, player } = setup();
    player.toggle('month');
    await flush();
    audio.emit('error');
    expect(player.snapshot().playing).toBeNull();
    expect(player.canPlay('month')).toBe(false);
    // Other lines are unaffected.
    expect(player.canPlay('plan')).toBe(true);
    player.toggle('month');
    await flush();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('goes quiet when a clip ends', async () => {
    const { audio, player } = setup();
    player.toggle('welcome');
    await flush();
    audio.emit('ended');
    expect(player.snapshot().playing).toBeNull();
  });

  it('tells its subscribers, and only when something changed', async () => {
    const { player } = setup();
    const listener = vi.fn();
    const unsubscribe = player.subscribe(listener);
    player.toggle('welcome');
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    player.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    player.stop();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('lets go of the element when the guide goes away', async () => {
    const { audio, player } = setup();
    player.toggle('welcome');
    await flush();
    player.dispose();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.removeAttribute).toHaveBeenCalledWith('src');
    expect(audio.listenerCount()).toBe(0);
    expect(player.snapshot().playing).toBeNull();
  });

  it('is text-only on a stack with no recordings', async () => {
    const { createAudio, player } = setup(undefined, new Set());
    player.unlock();
    player.say('welcome');
    player.toggle('welcome');
    await flush();
    expect(player.canPlay('welcome')).toBe(false);
    expect(createAudio).not.toHaveBeenCalled();
    expect(player.snapshot().playing).toBeNull();
  });
});
