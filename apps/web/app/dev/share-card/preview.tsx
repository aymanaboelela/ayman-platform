'use client';

import { useEffect, useRef } from 'react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { CertificateShare } from '@/components/share-card/certificate-share';
import { ResultShare } from '@/components/share-card/result-share';
import { lalezar, ruqaa } from '@/lib/fonts';
import { loadFonts, loadImage, resolveFonts } from '@/lib/share-card/canvas-kit';
import { drawCertificate } from '@/lib/share-card/draw-certificate';
import { drawResultCard } from '@/lib/share-card/draw-result';
import { tierFor, type ShareBrand } from '@/lib/share-card/model';

const c = copy.shareCard;
const RESULT = { studentName: 'مريم أحمد عبد الرحمن', examTitle: 'امتحان الشهر — الوحدة الأولى: الذكاء الاصطناعي', score: 19, total: 20 };
const CERT = { studentName: 'يوسف محمد السيد', courseTitle: 'البرمجة والذكاء الاصطناعي — تانية بكالوريا', completedAt: '2026-10-26T10:00:00.000Z' };

export function SharePreview({ brand }: { brand: ShareBrand }) {
  const host = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLCanvasElement>(null);
  const cert = useRef<HTMLCanvasElement>(null);
  const tier = tierFor(RESULT.score, RESULT.total) ?? 'onTrack';

  useEffect(() => {
    (async () => {
      if (!host.current || !story.current || !cert.current) return;
      // `?nohero` draws what another teacher's stack gets: no hero art.
      const fonts = resolveFonts(host.current);
      const [, hero] = await Promise.all([loadFonts(fonts), brand.heroSrc && !location.search.includes('nohero') ? loadImage(brand.heroSrc) : undefined]);
      drawResultCard(story.current, {
        ...RESULT,
        fonts,
        hero,
        qr: brand.qr,
        text: {
          platform: brand.platform,
          kicker: c.resultKicker,
          scoreOf: formatCopy(c.scoreOf, { total: RESULT.total.toLocaleString('ar-EG') }),
          tier: c.tiers[tier],
          tierLine: c.tierLines[tier],
          studyWith: formatCopy(c.studyWith, { teacher: brand.teacher }),
          siteHost: brand.siteHost,
          qrHint: c.qrHint,
        },
      });
      drawCertificate(cert.current, {
        ...CERT,
        fonts,
        hero,
        qr: brand.qr,
        text: {
          platform: brand.platform,
          title: c.certificateTitle,
          titleEn: c.certificateTitleEn,
          grantedTo: c.certificateGrantedTo,
          forCourse: c.certificateFor,
          teacher: brand.teacher,
          teacherLabel: c.certificateTeacher,
          dateLabel: c.certificateDate,
          seal: c.certificateSeal,
          siteHost: brand.siteHost,
        },
      });
      document.body.dataset.shareReady = '1';
    })();
  }, [brand, tier]);

  return (
    <main className={`${lalezar.variable} ${ruqaa.variable} mx-auto flex max-w-5xl flex-col gap-8 p-6`} ref={host}>
      <div className="flex max-w-md flex-col gap-3">
        <ResultShare data={RESULT} tier={tier} brand={brand} />
        <CertificateShare data={CERT} brand={brand} />
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <canvas id="story" ref={story} style={{ width: 360, height: 640 }} />
        <canvas id="cert" ref={cert} style={{ width: 620, height: 438 }} />
      </div>
    </main>
  );
}
