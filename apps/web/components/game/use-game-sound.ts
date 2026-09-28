'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

type Cue = 'tick' | 'go' | 'right' | 'combo' | 'wrong' | 'end';

/** نغمات قصيرة مركّبة بـWebAudio — مفيش ملفات صوت تتحمّل. [تردد، مدة بالثانية]. */
const CUES: Record<Cue, Array<[number, number]>> = {
  tick: [[880, 0.05]],
  go: [[523, 0.09], [784, 0.14]],
  right: [[659, 0.08], [988, 0.14]],
  combo: [[659, 0.07], [880, 0.07], [1319, 0.16]],
  wrong: [[220, 0.18], [165, 0.22]],
  end: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.22]],
};

const STORAGE_KEY = 'game:sound';

/**
 * أصوات اللعبة. الـAudioContext بيتعمل عند أول دوسة («يلا نبدأ») لأن المتصفح
 * مابيسمحش بصوت قبل تفاعل. والاختيار (شغّال/مقفول) بيتحفظ في localStorage —
 * راحة للطالب بس، فأي فشل في القراءة أو الكتابة بيتبلع والصوت بيفضل شغّال.
 */
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

export function useGameSound() {
  // `useSyncExternalStore` مش state + effect: السيرفر بيرندر «شغّال» دايمًا،
  // والمتصفح بيقرا الاختيار المحفوظ من غير رندر زيادة ولا hydration mismatch.
  const enabled = useSyncExternalStore(subscribe, readPreference, () => true);
  const context = useRef<AudioContext | null>(null);

  const unlock = useCallback(() => {
    if (context.current) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) context.current = new Ctor();
  }, []);

  const play = useCallback(
    (cue: Cue) => {
      const ctx = context.current;
      if (!enabled || !ctx) return;
      let at = ctx.currentTime;
      for (const [frequency, duration] of CUES[cue]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = cue === 'wrong' ? 'sawtooth' : 'triangle';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.12, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + duration + 0.02);
        at += duration * 0.9;
      }
    },
    [enabled],
  );

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, readPreference() ? 'off' : 'on');
    } catch {
      /* localStorage مقفول — الاختيار مش هيتحفظ، ومش مهم */
    }
    for (const listener of listeners) listener();
  }, []);

  // الراوتر بيسيب الصفحة في الـDOM لما الطالب يمشي؛ الـcontext لازم يتقفل.
  useEffect(
    () => () => {
      void context.current?.close();
      context.current = null;
    },
    [],
  );

  return useMemo(() => ({ enabled, play, unlock, toggle }), [enabled, play, unlock, toggle]);
}

export type GameSound = ReturnType<typeof useGameSound>;
