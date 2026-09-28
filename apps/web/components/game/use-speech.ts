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
 * قراية السؤال بصوت — Web Speech API، من غير أي خدمة برّه.
 *
 * بيدوّر على صوت عربي في الجهاز (مصري لو موجود، وإلا أي عربي). جهاز مالوش
 * صوت عربي بيقرا بالصوت الافتراضي، ولو المتصفح مابيدعمش القراية أصلًا الزرار
 * بيتقفل (`supported`) واللعبة شغّالة عادي.
 */
export function useSpeech() {
  const enabled = useSyncExternalStore(subscribe, readPreference, () => true);
  const supported = useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
    () => false,
  );

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const read = useCallback(
    (stemHtml: string, optionsHtml: string[], n: number) => {
      if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const text = [
        `السؤال ${n}.`,
        textOf(stemHtml),
        ...optionsHtml.map((html, i) => `${LETTERS[i] ?? ''}: ${textOf(html)}.`),
      ].join(' ');
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const voice = voices.find((v) => v.lang === 'ar-EG') ?? voices.find((v) => v.lang.toLowerCase().startsWith('ar'));
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? 'ar-EG';
      utterance.rate = 0.95;
      synth.speak(utterance);
    },
    [enabled],
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
