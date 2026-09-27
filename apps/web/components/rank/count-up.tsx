'use client';

import { useEffect, useRef, useState } from 'react';

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
  const [value, setValue] = useState(to);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (from === to) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutExpo: سريع في الأول وبيهدى على الرقم الأخير، عشان العين تلحق تقراه.
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    setValue(from);
    frame.current = requestAnimationFrame(step);

    // الراوتر بيسيب الـDOM ويعيد الـeffects لما الطالب يرجع للصفحة
    // (`router-keeps-the-dom-reruns-effects`)، فالـframe القديم لازم يتلغي.
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [from, to, durationMs]);

  return (
    <span className={className} aria-hidden="true">
      {value.toLocaleString('en-US')}
    </span>
  );
}
