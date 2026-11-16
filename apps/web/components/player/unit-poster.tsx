import Image from 'next/image';
import { Layers, Lock } from 'lucide-react';
import { cn } from '@ayman/ui/lib/cn';
import { getBrandAsset, type BrandAssetKind } from '@/lib/brand-assets';
import { artVariant } from '@/lib/subject-art';
import { UnitArt } from '@/components/library/unit-art';

/*
 * The same three text-free posters `course-art.tsx` dresses a cover-less
 * course in, picked per UNIT here (seeded by the section id) so the cards in
 * one rail are not all the same picture. Kept as its own short list rather
 * than exported from `course-art.tsx`: the crops differ — a unit tile is a
 * square, so each poster is framed on its subject, not on the 16/9 band.
 */
const POSTERS: readonly { kind: BrandAssetKind; position: string }[] = [
  { kind: 'practiceGuide', position: '35% center' },
  { kind: 'hero', position: '22% 30%' },
  { kind: 'portrait', position: 'center 22%' },
];

/**
 * A unit's picture in the lesson page: the uploaded unit cover, else one of
 * his posters, else the generated tile `UnitArt` has always drawn.
 *
 * ⚠️ The poster step is `getBrandAsset`, which is gated by `aymanOnly()` — on
 * any other teacher's stack every kind answers `undefined` and this is
 * exactly `UnitArt`, byte for byte (CLAUDE.md §2). The uploaded cover wins
 * everywhere, so an instructor who sets one is never overridden.
 *
 * `banner` fills a positioned parent (the open unit's header) instead of the
 * 3rem square; the caller owns the box.
 */
export function UnitPoster({
  coverKey,
  seed,
  locked = false,
  banner = false,
  number,
  className,
}: {
  coverKey: string | null;
  /** The section id — what picks the poster and, without one, the hue. */
  seed: string;
  locked?: boolean;
  banner?: boolean;
  /** The unit's 1-based position, drawn on the designed tile. */
  number?: number;
  className?: string;
}) {
  const pick = coverKey ? undefined : POSTERS[artVariant(seed)];
  const poster = pick ? getBrandAsset(pick.kind) : undefined;
  const classes = cn(banner && 'unit-art--banner', className);

  if (!poster || !pick) {
    return <UnitArt coverKey={coverKey} seed={seed} locked={locked} className={classes} />;
  }

  /*
   * Thumbnails on his stack: a designed tile with the unit's number on the
   * dragon-orange ramp instead of a crop of one of three posters. Every unit
   * of a course had the same three pictures repeating down the list
   * («عاوز أحط صور نضيفة»). The banner of the open unit keeps the poster —
   * it is one per screen, so it does not repeat. An uploaded «صورة الوحدة»
   * (admin → course → unit card) still wins over both.
   */
  if (!banner) {
    return (
      <span
        className={cn('unit-art unit-art--cinema', locked && 'unit-art--locked', classes)}
        data-variant={artVariant(seed)}
        aria-hidden="true"
      >
        {locked ? (
          <Lock className="size-4" />
        ) : number !== undefined ? (
          <span className="unit-art__num">{number}</span>
        ) : (
          <Layers className="size-5" />
        )}
      </span>
    );
  }

  return (
    <span
      className={cn('unit-art unit-art--photo unit-art--poster', locked && 'unit-art--locked', classes)}
      aria-hidden="true"
    >
      <Image
        src={poster.src}
        alt=""
        fill
        sizes={banner ? '(min-width: 1024px) 360px, 94vw' : '96px'}
        className="unit-art__photo"
        style={{ objectPosition: pick.position }}
      />
      {locked ? (
        <span className="unit-art__lock">
          <Lock className="size-4" />
        </span>
      ) : null}
    </span>
  );
}
