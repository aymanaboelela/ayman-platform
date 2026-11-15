import type { CSSProperties } from 'react';
import Image from 'next/image';
import { Layers, Lock } from 'lucide-react';
import { mediaUrl } from '@ayman/ui/branding';
import { cn } from '@ayman/ui/lib/cn';
import { hashString } from '@/lib/subject-art';

/**
 * «صورة الوحدة» — the square tile on a unit's card, in the lesson sidebar, on
 * the course page and on the phone's outline sheet.
 *
 * The uploaded cover when the instructor set one (`CourseSection.coverKey`),
 * and a generated tile when not: a two-stop gradient in a hue hashed from the
 * section id, so the same unit is the same colour on every screen and two
 * units in one course are not. A unit with no picture must still look like a
 * designed card — a grey square beside three coloured ones reads as the one
 * that failed to load.
 *
 * `aria-hidden` throughout: every caller prints the unit's title beside it.
 */
export function UnitArt({
  coverKey,
  seed,
  locked = false,
  className,
}: {
  coverKey: string | null;
  /** What the hue is derived from — the section id. */
  seed: string;
  /** A unit the subscription does not cover yet: greyed, with a padlock. */
  locked?: boolean;
  className?: string;
}) {
  if (coverKey) {
    return (
      <span
        className={cn('unit-art unit-art--photo', locked && 'unit-art--locked', className)}
        aria-hidden="true"
      >
        {/* `fill` inside a positioned square — `.unit-art` is `position:
            relative` with a fixed inline/block size, so nothing escapes. */}
        <Image src={mediaUrl(coverKey)} alt="" fill sizes="96px" className="unit-art__photo" />
      </span>
    );
  }

  const hue = (hashString(seed) % 24) * 15;
  return (
    <span
      className={cn('unit-art', locked && 'unit-art--locked', className)}
      aria-hidden="true"
      style={{ '--unit-h': hue } as CSSProperties}
    >
      {locked ? <Lock className="size-5" /> : <Layers className="size-5" />}
    </span>
  );
}
