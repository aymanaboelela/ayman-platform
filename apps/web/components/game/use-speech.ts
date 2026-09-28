'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'game:voice';
const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

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
function notify() {
  for (const listener of listeners) listener();
}

/**
 * المتصفح استلم الجمل ومانطقش ولا واحدة، حتى بعد محاولة تانية. Chrome على
 * الماك بيدخل الحالة دي بعد فترة ولكل المواقع — `speak()` بيرجع عادي، ومفيش
 * `error`، ومفيش صوت. الحالة دي بتظهر للطالب جملة بدل ما الزرار يبان بايظ.
 */
let stuck = false;
function setStuck(next: boolean) {
  if (stuck === next) return;
  stuck = next;
  notify();
}

/** مين عايز يعرف القراية شغّالة دلوقتي ولا لأ (الموسيقى بتوطى تحتها). */
const speakingListeners = new Set<(on: boolean) => void>();
function speaking(on: boolean) {
  for (const listener of speakingListeners) listener(on);
}

/** نص من HTML السؤال — القراية مالهاش دعوة بالوسوم. */
function textOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * ⚠️ الجمل اللي بتتقري لازم تفضل متشالة في حاجة عايشة. Chrome بيمسح الـ
 * `SpeechSynthesisUtterance` من الذاكرة لو محدش ماسكه، والقراية بتسكت في
 * النص أو ماتبدأش أصلًا — من غير أي error.
 */
let queue: SpeechSynthesisUtterance[] = [];
let pending: number | null = null;
/** الصوت الحقيقي (Azure): قطعة بتشتغل، واللي بعدها مستنية. */
let audio: HTMLAudioElement | null = null;
let clips: string[] = [];
/** مراقب «اتقالت ولا لأ» — بيتلغي مع أي `stop()`. */
let watchdog: number | null = null;

function arabicVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'ar-EG') ?? voices.find((v) => v.lang.toLowerCase().startsWith('ar'));
}

/** `getVoices()` بترجع فاضية في أول نداء على Chrome لحد ما `voiceschanged` تيجي. */
function withVoices(run: () => void) {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0) {
    run();
    return;
  }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    synth.removeEventListener('voiceschanged', go);
    run();
  };
  synth.addEventListener('voiceschanged', go);
  window.setTimeout(go, 1200);
}

/**
 * قراية السؤال بصوت — Web Speech API، من غير أي خدمة برّه.
 *
 * بيدوّر على صوت عربي في الجهاز (مصري لو موجود، وإلا أي عربي — على الماك
 * «Majed»). وتلات حاجات بتسكّت Chrome من غير ما يقول، واتعملهم حساب هنا:
 *   · `speak()` بعد `cancel()` على طول بيضيع — فيه مهلة صغيرة بينهم؛
 *   · جملة طويلة بتتقطع بعد ~١٥ ثانية — فالسؤال وكل اختيار جملة لوحدها؛
 *   · الـutterance اللي محدش ماسكه بيتمسح — `queue` فوق.
 * متصفح مابيدعمش القراية أصلًا الزرار بيتقفل (`supported`) واللعبة شغّالة عادي.
 */
export function useSpeech(onSpeaking?: (on: boolean) => void) {
  const enabled = useSyncExternalStore(subscribe, readPreference, () => true);
  const isStuck = useSyncExternalStore(subscribe, () => stuck, () => false);

  useEffect(() => {
    if (!onSpeaking) return;
    speakingListeners.add(onSpeaking);
    return () => {
      speakingListeners.delete(onSpeaking);
    };
  }, [onSpeaking]);
  const supported = useSyncExternalStore(
    subscribe,
    () => 'speechSynthesis' in window,
    () => false,
  );

  const stop = useCallback(() => {
    if (watchdog !== null) window.clearTimeout(watchdog);
    watchdog = null;
    speaking(false);
    clips = [];
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio = null;
    }
    if (!('speechSynthesis' in window)) return;
    if (pending !== null) window.clearTimeout(pending);
    pending = null;
    queue = [];
    window.speechSynthesis.cancel();
  }, []);

  const speakBrowser = useCallback((stemHtml: string, optionsHtml: string[], n: number) => {
    if (!('speechSynthesis' in window)) return;
    const lines = [
      `السؤال ${n}. ${textOf(stemHtml)}`,
      ...optionsHtml.map((html, i) => `${LETTERS[i] ?? ''}: ${textOf(html)}.`),
    ];
    /**
     * `attempt` التانية بعد `cancel()` + `resume()`: ده اللي بيفك Chrome لما
     * يكون علّق من جملة قديمة. لو التانية كمان ماطلعتش، `stuck` — والطالب
     * بيشوف ليه، بدل زرار بيتداس ومايعملش حاجة.
     */
    const say = (attempt: number) => {
      withVoices(() => {
        const synth = window.speechSynthesis;
        const voice = arabicVoice();
        let started = false;
        queue = lines.map((line, i) => {
          const utterance = new SpeechSynthesisUtterance(line);
          if (voice) utterance.voice = voice;
          utterance.lang = voice?.lang ?? 'ar-EG';
          utterance.rate = 0.95;
          utterance.onstart = () => {
            if (started) return;
            started = true;
            if (watchdog !== null) window.clearTimeout(watchdog);
            watchdog = null;
            setStuck(false);
            speaking(true);
          };
          if (i === lines.length - 1) {
            utterance.onend = () => speaking(false);
          }
          utterance.onerror = () => speaking(false);
          return utterance;
        });
        synth.resume();
        for (const utterance of queue) synth.speak(utterance);
        watchdog = window.setTimeout(() => {
          watchdog = null;
          if (started) return;
          synth.cancel();
          if (attempt === 0) {
            pending = window.setTimeout(() => {
              pending = null;
              say(1);
            }, 250);
          } else {
            queue = [];
            setStuck(true);
          }
        }, 2200);
      });
    };
    pending = window.setTimeout(() => {
      pending = null;
      say(0);
    }, 150);
  }, []);

  /**
   * القراية. لو الستاك عليه صوت حقيقي (`server`)، بيشغّل قطع MP3 من السيرفر:
   * السؤال، وبعدين لكل اختيار «حرفه» ونصه — فالقراية دايمًا بترتيب الشاشة. أي
   * قطعة تفشل (مفتاح اتشال، نت قطع) بترجّع الجولة دي لصوت المتصفح من الأول.
   */
  const read = useCallback(
    (input: { questionId: string; stemHtml: string; options: Array<{ id: string; bodyHtml: string }>; n: number; server: boolean }) => {
      if (!enabled) return;
      stop();
      const optionsHtml = input.options.map((option) => option.bodyHtml);
      if (!input.server) {
        speakBrowser(input.stemHtml, optionsHtml, input.n);
        return;
      }
      const base = `/api/me/game/voice/${encodeURIComponent(input.questionId)}`;
      clips = [
        `${base}/stem`,
        ...input.options.flatMap((option, i) => [`${base}/letter-${i}`, `${base}/${encodeURIComponent(option.id)}`]),
      ];
      // كل القطع بتتطلب مع بعض من الأول (`preload`)، فأول مرة حد يوصل للسؤال
      // السيرفر بيسجّلهم بالتوازي بدل واحدة ورا التانية بين كل جملة والتانية.
      const elements = clips.map((url) => {
        const el = new Audio(url);
        el.preload = 'auto';
        return el;
      });
      clips = [];
      const fallback = () => {
        stop();
        speakBrowser(input.stemHtml, optionsHtml, input.n);
      };
      // أول قطعة ماشتغلتش في ٥ ثواني (Azure بطيء أو النت واقع): صوت المتصفح
      // أحسن من سكوت والتايمر شغّال.
      watchdog = window.setTimeout(() => {
        watchdog = null;
        fallback();
      }, 5000);
      const playNext = () => {
        const el = elements.shift();
        if (!el) {
          audio = null;
          speaking(false);
          return;
        }
        audio = el;
        el.onplaying = () => {
          if (watchdog !== null) window.clearTimeout(watchdog);
          watchdog = null;
          speaking(true);
        };
        el.onended = playNext;
        el.onerror = fallback;
        el.play().catch(fallback);
      };
      playNext();
    },
    [enabled, stop, speakBrowser],
  );

  const toggle = useCallback(() => {
    const next = !readPreference();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* مش مهم */
    }
    if (!next) stop();
    notify();
  }, [stop]);

  return useMemo(
    () => ({ enabled, supported, stuck: isStuck, read, stop, toggle }),
    [enabled, supported, isStuck, read, stop, toggle],
  );
}
