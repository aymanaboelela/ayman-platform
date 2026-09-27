'use client';

import { useEffect, useRef } from 'react';

/**
 * رقم بيتعدّ لحد قيمته — «المركز» بينزل من حجم الدفعة لحد ترتيب الطالب،
 * والنقط بتطلع من صفر.
 *
 * السيرفر بيرندر القيمة النهائية على طول، والأنيميشن بيبدأ بعد الـhydration
 * بس. يعني الصفحة من غير JS، والقارئ الصوتي، ولقطة الشاشة كلهم بيشوفوا الرقم
 * الصح؛ والعدّ زينة فوقه، مش شرط إنه يوصل.
 *
 * `prefers-reduced-motion` بيوقفه خالص — رقم بيتغيّر قدّام العين حركة، حتى لو
 * مفيش حاجة بتتنقل من مكانها.
 */
export function CountUp({
  to,
  from = 0,
  durationMs = 1400,
  className,
}: {
  to: number;
  from?: number;
  durationMs?: number;
  className?: string;
}) {
  const node = useRef<HTMLSpanElement>(null);

  /*
   * الرقم بيتكتب في الـDOM على طول مش من state: ستين رندر في الثانية لرقم
   * واحد شغل مالوش لازمة، والـeffect مابيغيّرش حاجة React بتعرفها — آخر فريم
   * بيكتب `to`، اللي هو نفس اللي السيرفر رندره.
   */
  useEffect(() => {
    const el = node.current;
    if (!el || from === to) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutExpo: سريع في الأول وبيهدى على الرقم الأخير، عشان العين تلحق تقراه.
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      el.textContent = FORMAT.format(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    // الراوتر بيسيب الـDOM ويعيد الـeffects لما الطالب يرجع للصفحة
    // (`router-keeps-the-dom-reruns-effects`)، فالفريم القديم لازم يتلغي، والرقم
    // يرجع لقيمته لو الإلغاء جه في النص.
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = FORMAT.format(to);
    };
  }, [from, to, durationMs]);

  return (
    <span ref={node} className={className} aria-hidden="true">
      {FORMAT.format(to)}
    </span>
  );
}

const FORMAT = new Intl.NumberFormat('en-US');
