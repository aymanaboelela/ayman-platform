'use client';

import { useCallback, useState } from 'react';
import { Flame } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { drawResultCard } from '@/lib/share-card/draw-result';
import type { CardFonts } from '@/lib/share-card/canvas-kit';
import type { ResultCardData, ShareBrand, Tier } from '@/lib/share-card/model';
import { ShareCardDialog } from './share-card-dialog';

const c = copy.shareCard;

/**
 * «كارت النتيجة» — the button under the score, and the story image behind it.
 *
 * Rendered only when the server already decided the card is offered (feature
 * on, marks final, score at least half — see `tierFor`), so this component
 * never has to say no.
 */
export function ResultShare({ data, tier, brand }: { data: ResultCardData; tier: Tier; brand: ShareBrand }) {
  const [open, setOpen] = useState(false);

  const draw = useCallback(
    (canvas: HTMLCanvasElement, fonts: CardFonts, hero: HTMLImageElement | undefined) =>
      drawResultCard(canvas, {
        ...data,
        fonts,
        hero,
        qr: brand.qr,
        text: {
          platform: brand.platform,
          kicker: c.resultKicker,
          scoreOf: formatCopy(c.scoreOf, { total: data.total.toLocaleString('ar-EG') }),
          tier: c.tiers[tier],
          tierLine: c.tierLines[tier],
          studyWith: formatCopy(c.studyWith, { teacher: brand.teacher }),
          siteHost: brand.siteHost,
          qrHint: c.qrHint,
        },
      }),
    [data, tier, brand],
  );

  return (
    <>
      <button type="button" className="share-card-cta" onClick={() => setOpen(true)}>
        <Flame className="size-5" aria-hidden="true" />
        <span>{c.openResult}</span>
        <span className="share-card-cta__tier">{c.tiers[tier]}</span>
      </button>
      <ShareCardDialog
        open={open}
        onOpenChange={setOpen}
        title={c.dialogResultTitle}
        fileName="result"
        heroSrc={brand.heroSrc}
        draw={draw}
      />
    </>
  );
}
