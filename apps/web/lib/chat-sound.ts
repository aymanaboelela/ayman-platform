'use client';

/**
 * «صوت رسالة جديدة» — a short two-note chime, synthesised with Web Audio so
 * there is no sound file to ship, cache or 404.
 *
 * Per browser, in `localStorage`, because it is a preference about THIS
 * device (a laptop in a quiet room, a phone in a class), not about the
 * account. Every read and write is guarded: storage can throw in a private
 * window, and a chime is never worth an error.
 */
const KEY = 'ayman:chat-sound';
const listeners = new Set<() => void>();

let context: AudioContext | null = null;
let lastPlayedAt = 0;

export function isChatSoundOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setChatSoundOn(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, 'off');
  } catch {
    // Not persisted — the toggle still applies until the page reloads.
  }
  for (const listener of [...listeners]) listener();
  if (on) playChatSound(true);
}

/** `useSyncExternalStore`'s subscribe half for the toggle. */
export function subscribeChatSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Plays the chime — unless the sound is off, the tab is not being looked at
 * (the OS notification is that tab's signal), or one played a moment ago (a
 * reply arrives as a `chat` frame AND a notification row).
 *
 * Browsers refuse audio before the page has had a user gesture; then this is
 * silently nothing, which is the right failure.
 */
export function playChatSound(force = false): void {
  if (typeof window === 'undefined') return;
  if (!force && (!isChatSoundOn() || document.visibilityState !== 'visible')) return;
  const now = Date.now();
  if (!force && now - lastPlayedAt < 1500) return;
  lastPlayedAt = now;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const start = context.currentTime + 0.01;
    for (const [index, frequency] of [880, 1320].entries()) {
      const at = start + index * 0.11;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + 0.2);
    }
  } catch {
    // No audio on this device — nothing to say about it.
  }
}
