'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

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
export function useSpeech() {
  const enabled = useSyncExternalStore(subscribe, readPreference, () => true);
  const supported = useSyncExternalStore(
    subscribe,
    () => 'speechSynthesis' in window,
    () => false,
  );

  const stop = useCallback(() => {
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
    {
      const lines = [
        `السؤال ${n}. ${textOf(stemHtml)}`,
        ...optionsHtml.map((html, i) => `${LETTERS[i] ?? ''}: ${textOf(html)}.`),
      ];
      pending = window.setTimeout(() => {
        pending = null;
        withVoices(() => {
          const synth = window.speechSynthesis;
          const voice = arabicVoice();
          queue = lines.map((line) => {
            const utterance = new SpeechSynthesisUtterance(line);
            if (voice) utterance.voice = voice;
            utterance.lang = voice?.lang ?? 'ar-EG';
            utterance.rate = 0.95;
            return utterance;
          });
          synth.resume();
          for (const utterance of queue) synth.speak(utterance);
        });
      }, 150);
    }
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
      const playNext = () => {
        const el = elements.shift();
        if (!el) {
          audio = null;
          return;
        }
        audio = el;
        el.onended = playNext;
        el.onerror = () => {
          stop();
          speakBrowser(input.stemHtml, optionsHtml, input.n);
        };
        el.play().catch(() => {
          stop();
          speakBrowser(input.stemHtml, optionsHtml, input.n);
        });
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
    for (const listener of listeners) listener();
  }, [stop]);

  return useMemo(() => ({ enabled, supported, read, stop, toggle }), [enabled, supported, read, stop, toggle]);
}
