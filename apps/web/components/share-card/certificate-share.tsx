'use client';

import { useCallback, useState } from 'react';
import { Award, Medal } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { CardFonts } from '@/lib/share-card/canvas-kit';
import { drawExamCertificate } from '@/lib/share-card/draw-exam-certificate';
import { drawUnitCertificate } from '@/lib/share-card/draw-unit-certificate';
import type { ShareBrand } from '@/lib/share-card/model';
import { ShareCardDialog } from './share-card-dialog';

const c = copy.shareCard;

const percentText = (n: number) => `${n.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}٪`;

export interface UnitCertificateData {
  studentName: string;
  unitTitle: string;
  courseTitle: string;
  averagePercent: number;
  earnedAt: string;
}

/** «شهادة الوحدة» — black and fire. Offered only for an EARNED unit. */
export function UnitCertificateShare({ data, brand }: { data: UnitCertificateData; brand: ShareBrand }) {
  const [open, setOpen] = useState(false);

  const draw = useCallback(
    (
      canvas: HTMLCanvasElement,
      fonts: CardFonts,
      hero: HTMLImageElement | undefined,
      signature: HTMLImageElement | undefined,
    ) =>
      drawUnitCertificate(canvas, {
        studentName: data.studentName,
        unitTitle: data.unitTitle,
        courseTitle: data.courseTitle,
        earnedAt: data.earnedAt,
        fonts,
        hero,
        signature,
        qr: brand.qr,
        text: {
          platform: brand.platform,
          title: c.unitTitle,
          titleEn: c.unitTitleEn,
          grantedTo: c.certificateGrantedTo,
          forUnit: c.unitFor,
          average: formatCopy(c.unitAverage, { percent: percentText(data.averagePercent) }),
          teacher: brand.teacher,
          teacherLabel: c.certificateTeacher,
          dateLabel: c.certificateDate,
          seal: c.unitSeal,
          siteHost: brand.siteHost,
        },
      }),
    [data, brand],
  );

  return (
    <>
      <button type="button" className="share-card-cta share-card-cta--gold" onClick={() => setOpen(true)}>
        <Award className="size-5" aria-hidden="true" />
        <span>{c.openUnitCertificate}</span>
      </button>
      <ShareCardDialog
        open={open}
        onOpenChange={setOpen}
        title={c.dialogCertificateTitle}
        fileName="unit-certificate"
        heroSrc={brand.heroSrc}
        // Black paper: the light-ink file, else the dark-paper one.
        signatureSrc={brand.signatureDarkSrc ?? brand.signatureSrc}
        pdf
        draw={draw}
      />
    </>
  );
}

export interface ExamCertificateData {
  studentName: string;
  examTitle: string;
  courseTitle: string;
  score: number;
  total: number;
  earnedAt: string;
}

/** «شهادة التفوّق» — ivory, navy and gold. Offered only at 85%+ on an exam. */
export function ExamCertificateShare({ data, brand }: { data: ExamCertificateData; brand: ShareBrand }) {
  const [open, setOpen] = useState(false);

  const draw = useCallback(
    (
      canvas: HTMLCanvasElement,
      fonts: CardFonts,
      _hero: HTMLImageElement | undefined,
      signature: HTMLImageElement | undefined,
    ) =>
      drawExamCertificate(canvas, {
        ...data,
        fonts,
        signature,
        qr: brand.qr,
        text: {
          platform: brand.platform,
          title: c.examTitle,
          titleEn: c.examTitleEn,
          grantedTo: c.certificateGrantedTo,
          forExam: c.examFor,
          scoreOf: formatCopy(c.scoreOf, { total: data.total.toLocaleString('ar-EG') }),
          teacher: brand.teacher,
          teacherLabel: c.certificateTeacher,
          dateLabel: c.certificateDate,
          seal: c.examSeal,
          siteHost: brand.siteHost,
        },
      }),
    [data, brand],
  );

  return (
    <>
      <button type="button" className="share-card-cta share-card-cta--ivory" onClick={() => setOpen(true)}>
        <Medal className="size-5" aria-hidden="true" />
        <span>{c.openExamCertificate}</span>
      </button>
      {/* No hero: the exam certificate is the formal document, and his
          composite belongs to the fire one. */}
      <ShareCardDialog
        open={open}
        onOpenChange={setOpen}
        title={c.dialogCertificateTitle}
        fileName="exam-certificate"
        // Ivory paper: the dark-ink file, else the other one.
        signatureSrc={brand.signatureSrc ?? brand.signatureDarkSrc}
        pdf
        draw={draw}
      />
    </>
  );
}
