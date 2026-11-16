import { guideCopy, type GuideVoiceKey } from '@ayman/contracts/copy/guide';
import { IS_AYMAN } from '@/lib/tenant';
import { readStored, writeStored } from './guide-gate';

/**
 * The spoken half of the guide: which lines have a recording, and the one
 * audio element that plays them.
 *
 * ## The manifest is the script
 *
 * Every key under `guideCopy.voice` is recorded, so every key has a clip at
 * `/guide-voice/<key>.mp3` (`apps/web/public/guide-voice/`). There is no
 * second list to forget to update: adding a line to the script and dropping
 * its file in is the whole change, and `guide-voice.test.ts` fails when a key
 * has no file or a file has no key.
 *
 * ## His stack only
 *
 * The clips are the original instructor's own voice, and the first one says
 * his name. Another teacher's stack with the guide switched on gets the same
 * lines as TEXT — `tenantName()` fills the name on screen — and no audio at
 * all until that teacher has recordings of their own. The files exist on every
 * stack's disk (it is one image); what is gated is that nothing ever asks for
 * them, which is the same gate his photographs in `public/brand/` sit behind.
 *
 * ## The voice is an enhancement, never the message
 *
 * Every line is on screen as text first. So every way playback can fail — no
 * clip, a 404, a blocked autoplay, a muted tab, a phone on silent — ends in
 * the same place: the text the student was already reading.
 */

const SCRIPT_KEYS = Object.keys(guideCopy.voice) as GuideVoiceKey[];

/** The lines that have a clip on THIS stack. */
export const VOICE_KEYS: ReadonlySet<GuideVoiceKey> = new Set(IS_AYMAN ? SCRIPT_KEYS : []);

export function voiceSrc(key: GuideVoiceKey, keys: ReadonlySet<GuideVoiceKey> = VOICE_KEYS): string | null {
  return keys.has(key) ? `/guide-voice/${key}.mp3` : null;
}

/** `localStorage` — the student muted the voice; it stays muted next visit. */
export const GUIDE_MUTED_KEY = 'guide:v1:muted';

export interface VoiceSnapshot {
  /** The line being spoken right now, if any. */
  playing: GuideVoiceKey | null;
  muted: boolean;
}

/** The slice of `HTMLAudioElement` the player uses — what a test stands in for. */
export interface VoiceAudio {
  preload: string;
  src: string;
  currentTime: number;
  play: () => Promise<void> | void;
  pause: () => void;
  addEventListener: (type: 'ended' | 'error', listener: () => void) => void;
  removeEventListener: (type: 'ended' | 'error', listener: () => void) => void;
  removeAttribute: (name: string) => void;
}

export interface VoicePlayer {
  snapshot: () => VoiceSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** The student touched the guide — from here a new line may start by itself. */
  unlock: () => void;
  /** A new line is on screen: speak it if allowed, otherwise fall silent. */
  say: (key: GuideVoiceKey | null) => void;
  /** The play button: start this line, or stop it if it is the one playing. */
  toggle: (key: GuideVoiceKey) => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  /** Whether a play button is worth drawing for this line. */
  canPlay: (key: GuideVoiceKey) => boolean;
  dispose: () => void;
}

export function createVoicePlayer(options: {
  createAudio: () => VoiceAudio;
  storage: Storage | undefined;
  keys?: ReadonlySet<GuideVoiceKey>;
}): VoicePlayer {
  const keys = options.keys ?? VOICE_KEYS;
  const listeners = new Set<() => void>();
  /** Clips that failed to load this page view — not asked for twice. */
  const broken = new Set<GuideVoiceKey>();
  let audio: VoiceAudio | null = null;
  let unlocked = false;
  let state: VoiceSnapshot = {
    playing: null,
    muted: readStored(options.storage, GUIDE_MUTED_KEY) === '1',
  };

  function set(next: Partial<VoiceSnapshot>) {
    const merged = { ...state, ...next };
    if (merged.playing === state.playing && merged.muted === state.muted) return;
    state = merged;
    for (const listener of listeners) listener();
  }

  const onEnded = () => set({ playing: null });
  const onError = () => {
    // A missing or unreadable file. Remember it so the button for this line
    // goes away instead of failing again on every press.
    if (state.playing) broken.add(state.playing);
    set({ playing: null });
  };

  /**
   * ONE element for the whole guide, created on the first press and reused.
   * `preload = 'none'` and no `src` until a line is actually played, so a
   * guide nobody listens to downloads no audio — and a line that is played
   * downloads exactly its own clip. Reuse also matters on iOS, where an
   * element that has played once from a tap may be played again without one.
   */
  function element(): VoiceAudio {
    if (!audio) {
      audio = options.createAudio();
      audio.preload = 'none';
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
    }
    return audio;
  }

  function canPlay(key: GuideVoiceKey): boolean {
    return voiceSrc(key, keys) !== null && !broken.has(key);
  }

  function stop() {
    if (audio && state.playing !== null) {
      audio.pause();
      audio.currentTime = 0;
    }
    set({ playing: null });
  }

  function start(key: GuideVoiceKey) {
    const src = voiceSrc(key, keys);
    if (src === null || broken.has(key)) {
      stop();
      return;
    }
    const target = element();
    target.pause();
    target.src = src;
    set({ playing: key });
    /*
     * The browser decides whether this is allowed, and «no» is a normal
     * answer: no gesture yet, a data-saver setting, a policy. It is NOT
     * retried and not worked around — the line is already on screen, and the
     * play button is one tap away, which IS a gesture.
     */
    void Promise.resolve()
      .then(() => target.play())
      .catch(() => {
        if (state.playing === key) set({ playing: null });
      });
  }

  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unlock() {
      unlocked = true;
    },
    say(key) {
      // Never before the student has touched the guide, and never when muted:
      // an unprompted voice from a tab is how a page gets closed.
      if (key === null || state.muted || !unlocked) {
        stop();
        return;
      }
      // Already speaking it: asked twice for one line (a focus handler and
      // the effect that follows it) must not restart the clip from zero.
      if (key === state.playing) return;
      start(key);
    },
    toggle(key) {
      unlocked = true;
      if (state.playing === key) {
        stop();
        return;
      }
      // Pressing play is asking to hear it: that un-mutes.
      if (state.muted) {
        writeStored(options.storage, GUIDE_MUTED_KEY, null);
        set({ muted: false });
      }
      start(key);
    },
    stop,
    setMuted(muted) {
      writeStored(options.storage, GUIDE_MUTED_KEY, muted ? '1' : null);
      if (muted) stop();
      set({ muted });
    },
    canPlay,
    dispose() {
      if (audio) {
        audio.pause();
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        // Drops the buffered clip; a paused element with a `src` keeps it.
        audio.removeAttribute('src');
        audio = null;
      }
      listeners.clear();
      state = { ...state, playing: null };
    },
  };
}

/** The player and its state together — what the guide's components are handed. */
export interface GuideVoice extends VoiceSnapshot {
  player: VoicePlayer;
}
