'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ShowScore } from './show-score';

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
/**
 * The choice as of the last press, for when localStorage refuses the write
 * (private window, blocked site data). Without it the button flipped nothing
 * there: the write failed, the read still said «on», and the music played on.
 */
let pressed: boolean | null = null;

function readPreference(): boolean {
  if (pressed !== null) return pressed;
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
  const score = useRef<ShowScore | null>(null);

  const unlock = useCallback(() => {
    if (context.current) {
      // اتعمل قبل كده بس المتصفح ساب الـcontext «suspended» (تاب اتقفل
      // ورجع، أو Safari). الدوسة دي هي الفرصة الوحيدة نصحّيه فيها.
      if (context.current.state === 'suspended') void context.current.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context.current = new Ctor();
    score.current = new ShowScore(context.current);
  }, []);

  /**
   * موسيقى «المليون» (`show-score.ts`). كل نداء بيعدّي من هنا عشان زرار
   * «الصوت» يقفلها هي كمان، ومن غير context (المتصفح مالوش WebAudio) بتسكت
   * واللعبة شغّالة عادي.
   */
  /*
   * `show` and `play` read the LIVE choice, not `enabled` from the render that
   * made them. The game hands them to timers — the bed starts 1 s after a
   * question opens, the fanfare 1.8 s after a reveal — and a timer set before
   * «اقفل الصوت» kept the old closure, so muting mid-question brought the
   * music straight back.
   */
  const show = useCallback(
    (run: (score: ShowScore) => void) => {
      const ctx = context.current;
      if (!readPreference() || !ctx || !score.current) return;
      if (ctx.state === 'suspended') void ctx.resume();
      run(score.current);
    },
    [],
  );

  const play = useCallback(
    (cue: Cue) => {
      const ctx = context.current;
      if (!readPreference() || !ctx) return;
      // Safari وChrome ساعات بيسيبوه «suspended» لحد دوسة تانية — بنصحّيه.
      if (ctx.state === 'suspended') void ctx.resume();
      let at = ctx.currentTime;
      for (const [frequency, duration] of CUES[cue]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = cue === 'wrong' ? 'sawtooth' : 'triangle';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + duration + 0.02);
        at += duration * 0.9;
      }
    },
    [],
  );

  const toggle = useCallback(() => {
    const next = !readPreference();
    pressed = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* localStorage مقفول — الاختيار مش هيتحفظ، ومش مهم */
    }
    if (!next) {
      // `stopAll` only ends the bed and the tension loop; the intro chord, a
      // fanfare and the thumps already scheduled ahead kept sounding. Pausing
      // the context silences all of it at once; `show`/`play` resume it.
      score.current?.stopAll(0.05);
      void context.current?.suspend();
    }
    for (const listener of listeners) listener();
  }, []);

  // الراوتر بيسيب الصفحة في الـDOM لما الطالب يمشي؛ الـcontext لازم يتقفل.
  useEffect(
    () => () => {
      score.current?.stopAll(0.05);
      score.current = null;
      void context.current?.close();
      context.current = null;
    },
    [],
  );

  return useMemo(() => ({ enabled, play, show, unlock, toggle }), [enabled, play, show, unlock, toggle]);
}

export type GameSound = ReturnType<typeof useGameSound>;
