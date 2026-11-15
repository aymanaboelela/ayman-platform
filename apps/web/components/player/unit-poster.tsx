import Image from 'next/image';
import { Lock } from 'lucide-react';
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
  className,
}: {
  coverKey: string | null;
  /** The section id — what picks the poster and, without one, the hue. */
  seed: string;
  locked?: boolean;
  banner?: boolean;
  className?: string;
}) {
  const pick = coverKey ? undefined : POSTERS[artVariant(seed)];
  const poster = pick ? getBrandAsset(pick.kind) : undefined;
  const classes = cn(banner && 'unit-art--banner', className);

  if (!poster || !pick) {
    return <UnitArt coverKey={coverKey} seed={seed} locked={locked} className={classes} />;
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
