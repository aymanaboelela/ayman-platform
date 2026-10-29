import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_PREFS, readSoundPrefs, writeSoundPrefs } from './focus-sound';

/**
 * The stored choice is read on every render of «أوضة المذاكرة», so whatever
 * sits in storage — an old shape, a hand-edited value, nothing — must come
 * back as something the panel can render.
 */
describe('focus sound preferences', () => {
  afterEach(() => window.localStorage.clear());

  it('falls back to the defaults on an empty or broken entry', () => {
    expect(readSoundPrefs()).toEqual(DEFAULT_SOUND_PREFS);
    window.localStorage.setItem('focus-sound:v1', '{not json');
    expect(readSoundPrefs()).toEqual(DEFAULT_SOUND_PREFS);
  });

  it('keeps the known fields and drops the unknown ones', () => {
    window.localStorage.setItem('focus-sound:v1', JSON.stringify({ alarm: 'gong', ambient: 'rain', volume: 7 }));
    expect(readSoundPrefs()).toEqual({ alarm: DEFAULT_SOUND_PREFS.alarm, ambient: 'rain', volume: 1 });
  });

  it('returns the same object until the stored value changes', () => {
    writeSoundPrefs({ alarm: 'crystal' });
    const first = readSoundPrefs();
    expect(readSoundPrefs()).toBe(first);
    writeSoundPrefs({ volume: 0.3 });
    expect(readSoundPrefs()).not.toBe(first);
    expect(readSoundPrefs()).toMatchObject({ alarm: 'crystal', volume: 0.3 });
  });
});
