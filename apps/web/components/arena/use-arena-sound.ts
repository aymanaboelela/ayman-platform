'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { Cue } from './arena-state';

/**
 * أصوات الساحة — كلها بتتركّب بـWeb Audio وقت ما تتلعب، مفيش ملف بيتحمّل
 * ولا حاجة من CDN. كل صوت نغمات قصيرة: [تردد، مدة بالثانية، شكل الموجة].
 *
 * المتصفح مابيسمحش بصوت قبل ما الطالب يدوس حاجة، فالـAudioContext بيتعمل في
 * `unlock()` من دوسة «يلا نبدأ». والاختيار (شغّال/مقفول) في localStorage —
 * راحة بس، فأي فشل في القراية أو الكتابة بيتبلع والصوت بيفضل شغّال.
 */
type Note = [freq: number, seconds: number, wave?: OscillatorType, glideTo?: number];

const CUES: Record<Cue, { notes: Note[]; gain: number }> = {
  blip: { notes: [[1320, 0.06, 'sine', 1100]], gain: 0.08 },
  matched: {
    notes: [
      [220, 0.08, 'sawtooth', 440],
      [523, 0.09, 'triangle'],
      [659, 0.09, 'triangle'],
      [784, 0.2, 'triangle'],
    ],
    gain: 0.18,
  },
  go: { notes: [[660, 0.07, 'square'], [990, 0.11, 'square']], gain: 0.08 },
  right: { notes: [[784, 0.07, 'triangle'], [1047, 0.08, 'triangle'], [1568, 0.16, 'sine']], gain: 0.22 },
  wrong: { notes: [[196, 0.14, 'sawtooth', 150], [147, 0.2, 'sawtooth']], gain: 0.14 },
  steal: { notes: [[523, 0.06, 'triangle'], [659, 0.06, 'triangle'], [880, 0.1, 'triangle']], gain: 0.14 },
  'lost-point': { notes: [[440, 0.1, 'triangle', 330], [262, 0.18, 'triangle']], gain: 0.14 },
  miss: { notes: [[330, 0.1, 'sine'], [294, 0.14, 'sine']], gain: 0.1 },
  alert: { notes: [[880, 0.1, 'square'], [0, 0.06], [880, 0.1, 'square']], gain: 0.08 },
  back: { notes: [[523, 0.07, 'sine'], [784, 0.12, 'sine']], gain: 0.12 },
  win: {
    notes: [
      [523, 0.1, 'triangle'],
      [659, 0.1, 'triangle'],
      [784, 0.1, 'triangle'],
      [1047, 0.18, 'triangle'],
      [784, 0.08, 'triangle'],
      [1047, 0.32, 'triangle'],
    ],
    gain: 0.22,
  },
  lose: { notes: [[392, 0.16, 'triangle'], [370, 0.16, 'triangle'], [349, 0.16, 'triangle'], [330, 0.36, 'triangle', 300]], gain: 0.16 },
  draw: { notes: [[523, 0.12, 'triangle'], [523, 0.12, 'triangle'], [659, 0.24, 'triangle']], gain: 0.16 },
  tick: { notes: [[1200, 0.03, 'square']], gain: 0.05 },
};

const STORAGE_KEY = 'arena:sound';

function readPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useArenaSound() {
  // السيرفر بيرندر «شغّال»، والمتصفح بيقرا المحفوظ من غير hydration mismatch.
  const enabled = useSyncExternalStore(subscribe, readPreference, () => true);
  const context = useRef<AudioContext | null>(null);

  const unlock = useCallback(() => {
    if (context.current) {
      if (context.current.state === 'suspended') void context.current.resume();
      return;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      context.current = new Ctor();
    } catch {
      context.current = null;
    }
  }, []);

  const play = useCallback(
    (cue: Cue) => {
      const ctx = context.current;
      if (!enabled || !ctx) return;
      if (ctx.state === 'suspended') void ctx.resume();
      const { notes, gain } = CUES[cue];
      let at = ctx.currentTime + 0.01;
      for (const [freq, seconds, wave = 'triangle', glideTo] of notes) {
        if (freq > 0) {
          const osc = ctx.createOscillator();
          const amp = ctx.createGain();
          osc.type = wave;
          osc.frequency.setValueAtTime(freq, at);
          if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + seconds);
          amp.gain.setValueAtTime(0.0001, at);
          amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
          amp.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
          osc.connect(amp).connect(ctx.destination);
          osc.start(at);
          osc.stop(at + seconds + 0.02);
        }
        at += seconds;
      }
    },
    [enabled],
  );

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, readPreference() ? 'off' : 'on');
    } catch {
      // مفيش تخزين (تاب خاص) — الزرار بيفضل على حاله، والصوت شغّال.
    }
    for (const listener of listeners) listener();
  }, []);

  useEffect(
    () => () => {
      void context.current?.close().catch(() => undefined);
      context.current = null;
    },
    [],
  );

  return { enabled, play, unlock, toggle };
}

export type ArenaSound = ReturnType<typeof useArenaSound>;
