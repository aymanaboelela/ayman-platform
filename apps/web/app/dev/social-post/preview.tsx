'use client';

import { useEffect, useRef } from 'react';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import type { SocialFacts, SocialPostFormat } from '@ayman/contracts/social/posts';
import { lalezar, ruqaa } from '@/lib/fonts';
import { loadFonts, resolveFonts } from '@/lib/share-card/canvas-kit';
import { drawSocialPost, type PostBrand } from '@/lib/social-posts/draw-post';
import { resolvePalette } from '@/lib/social-posts/palette';

const person = (name: string, score: number | null = null, total: number | null = null, rank: number | null = null) => ({
  name,
  photoKey: null,
  score,
  total,
  rank,
});

const SAMPLES: SocialFacts[] = [
  {
    kind: 'honor',
    day: '2026-10-20',
    title: 'امتحان شهر أكتوبر — الوحدة الأولى',
    people: [person('مريم أ.', 50, 50, 1), person('يوسف م.', 49, 50, 2), person('عبد الله ك.', 48.5, 50, 3), person('سلمى خ.', 48, 50), person('نور ح.', 47, 50)],
  },
  {
    kind: 'results',
    examTitle: 'امتحان الوحدة الأولى: الذكاء الاصطناعي',
    courseTitle: 'منهج البرمجة والذكاء الاصطناعي — تانية بكالوريا',
    takers: 214,
    averagePercent: 78.4,
    passRate: 91.2,
    fullMarks: 17,
    top: [person('مريم أ.', 20, 20), person('يوسف م.', 20, 20), person('سلمى خ.', 19.5, 20)],
  },
  {
    kind: 'certificates',
    weekStart: '2026-10-17',
    total: 46,
    units: [
      { title: 'الوحدة الأولى — الذكاء الاصطناعي', count: 23 },
      { title: 'امتحان شهر أكتوبر', count: 15 },
      { title: 'الوحدة التانية — البيانات', count: 8 },
    ],
    people: [person('مريم أ.'), person('يوسف م.'), person('سلمى خ.'), person('عبد الله ك.'), person('نور ح.'), person('هالة س.')],
  },
  { kind: 'course', title: 'كورس المراجعة النهائية — تانية بكالوريا', subtitle: 'كل المنهج في أربع أسابيع، بامتحان بعد كل وحدة.', coverKey: null },
  { kind: 'lecture', title: 'المحاضرة الخامسة: الشروط والتكرار', courseTitle: 'تانية بكالوريا', sectionTitle: 'الوحدة التانية', coverKey: null },
  { kind: 'news', title: 'مواعيد امتحانات شهر نوفمبر', excerpt: 'الجدول الكامل لامتحانات الشهر، ومعاد كل وحدة، وإزاي التسجيل.', coverKey: null },
];

export function SocialPostPreview({ brand }: { brand: PostBrand }) {
  const host = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      if (!host.current || !grid.current) return;
      const fonts = resolveFonts(host.current);
      await loadFonts(fonts);
      const palette = resolvePalette(host.current);
      const canvases = grid.current.querySelectorAll('canvas');
      canvases.forEach((canvas) => {
        const index = Number(canvas.dataset.index);
        const format = canvas.dataset.format as SocialPostFormat;
        const facts = SAMPLES[index]!;
        drawSocialPost(canvas, {
          facts,
          format,
          kindLabel: socialPostsCopy.kinds[facts.kind],
          brand,
          palette,
          fonts,
          images: { photos: new Map() },
        });
      });
    })();
  }, [brand]);

  return (
    <main className="mx-auto grid max-w-[1400px] gap-6 p-6">
      <div ref={host} className={`${lalezar.variable} ${ruqaa.variable}`} hidden />
      <div ref={grid} className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {SAMPLES.flatMap((facts, index) =>
          (['square', 'story'] as const).map((format) => (
            <canvas
              key={`${facts.kind}-${format}`}
              data-index={index}
              data-format={format}
              className="h-auto w-full rounded-lg shadow-[var(--shadow-md)]"
            />
          )),
        )}
      </div>
    </main>
  );
}
