'use client';

import { useCallback, useState } from 'react';
import { Award } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { drawCertificate } from '@/lib/share-card/draw-certificate';
import type { CardFonts } from '@/lib/share-card/canvas-kit';
import type { CertificateData, ShareBrand } from '@/lib/share-card/model';
import { ShareCardDialog } from './share-card-dialog';

const c = copy.shareCard;

/** «شهادة الإتمام» — offered once every published lesson of the course is done. */
export function CertificateShare({ data, brand }: { data: CertificateData; brand: ShareBrand }) {
  const [open, setOpen] = useState(false);

  const draw = useCallback(
    (canvas: HTMLCanvasElement, fonts: CardFonts, hero: HTMLImageElement | undefined) =>
      drawCertificate(canvas, {
        ...data,
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
      }),
    [data, brand],
  );

  return (
    <>
      <button type="button" className="share-card-cta share-card-cta--gold" onClick={() => setOpen(true)}>
        <Award className="size-5" aria-hidden="true" />
        <span>{c.openCertificate}</span>
      </button>
      <ShareCardDialog
        open={open}
        onOpenChange={setOpen}
        title={c.dialogCertificateTitle}
        fileName="certificate"
        heroSrc={brand.heroSrc}
        pdf
        draw={draw}
      />
    </>
  );
}
