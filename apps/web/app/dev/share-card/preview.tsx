'use client';

import { useEffect, useRef } from 'react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { ExamCertificateShare, UnitCertificateShare } from '@/components/share-card/certificate-share';
import { ResultShare } from '@/components/share-card/result-share';
import { lalezar, ruqaa } from '@/lib/fonts';
import { loadFonts, loadImage, resolveFonts } from '@/lib/share-card/canvas-kit';
import { drawExamCertificate } from '@/lib/share-card/draw-exam-certificate';
import { drawResultCard } from '@/lib/share-card/draw-result';
import { drawUnitCertificate } from '@/lib/share-card/draw-unit-certificate';
import { tierFor, type ShareBrand } from '@/lib/share-card/model';

const c = copy.shareCard;
const RESULT = { studentName: 'مريم أحمد عبد الرحمن', examTitle: 'امتحان الشهر — الوحدة الأولى: الذكاء الاصطناعي', score: 19, total: 20 };
const UNIT = {
  studentName: 'يوسف محمد السيد',
  unitTitle: 'الوحدة الأولى — الذكاء الاصطناعي',
  courseTitle: 'منهج البرمجة والذكاء الاصطناعي — تانية بكالوريا',
  averagePercent: 92.5,
  earnedAt: '2026-10-26T10:00:00.000Z',
};
const EXAM = {
  studentName: 'سلمى خالد إبراهيم',
  examTitle: 'امتحان شهر أكتوبر',
  courseTitle: 'منهج البرمجة والذكاء الاصطناعي — تانية بكالوريا',
  score: 18.5,
  total: 20,
  earnedAt: '2026-10-26T10:00:00.000Z',
};
const pct = (n: number) => `${n.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}٪`;

/** `?nohero` draws what another teacher's stack gets: no hero art. */
export function SharePreview({ brand }: { brand: ShareBrand }) {
  const host = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLCanvasElement>(null);
  const unit = useRef<HTMLCanvasElement>(null);
  const exam = useRef<HTMLCanvasElement>(null);
  const tier = tierFor(RESULT.score, RESULT.total) ?? 'onTrack';

  useEffect(() => {
    (async () => {
      if (!host.current || !story.current || !unit.current || !exam.current) return;
      const fonts = resolveFonts(host.current);
      const [, hero] = await Promise.all([
        loadFonts(fonts),
        brand.heroSrc && !location.search.includes('nohero') ? loadImage(brand.heroSrc) : undefined,
      ]);
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
      drawUnitCertificate(unit.current, {
        ...UNIT,
        fonts,
        hero,
        qr: brand.qr,
        text: {
          platform: brand.platform,
          title: c.unitTitle,
          titleEn: c.unitTitleEn,
          grantedTo: c.certificateGrantedTo,
          forUnit: c.unitFor,
          average: formatCopy(c.unitAverage, { percent: pct(UNIT.averagePercent) }),
          teacher: brand.teacher,
          teacherLabel: c.certificateTeacher,
          dateLabel: c.certificateDate,
          seal: c.unitSeal,
          siteHost: brand.siteHost,
        },
      });
      drawExamCertificate(exam.current, {
        ...EXAM,
        fonts,
        qr: brand.qr,
        text: {
          platform: brand.platform,
          title: c.examTitle,
          titleEn: c.examTitleEn,
          grantedTo: c.certificateGrantedTo,
          forExam: c.examFor,
          scoreOf: formatCopy(c.scoreOf, { total: EXAM.total.toLocaleString('ar-EG') }),
          teacher: brand.teacher,
          teacherLabel: c.certificateTeacher,
          dateLabel: c.certificateDate,
          seal: c.examSeal,
          siteHost: brand.siteHost,
        },
      });
      document.body.dataset.shareReady = '1';
    })();
  }, [brand, tier]);

  return (
    <main className={`${lalezar.variable} ${ruqaa.variable} mx-auto flex max-w-6xl flex-col gap-8 p-6`} ref={host}>
      <div className="flex max-w-md flex-col gap-3">
        <ResultShare data={RESULT} tier={tier} brand={brand} />
        <UnitCertificateShare data={UNIT} brand={brand} />
        <ExamCertificateShare data={EXAM} brand={brand} />
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <canvas id="story" ref={story} style={{ width: 360, height: 640 }} />
        <canvas id="cert" ref={unit} style={{ width: 620, height: 438 }} />
        <canvas id="exam" ref={exam} style={{ width: 620, height: 438 }} />
      </div>
    </main>
  );
}
