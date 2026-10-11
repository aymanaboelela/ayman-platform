'use client';

import { useState } from 'react';
import { RotateCw } from 'lucide-react';

/**
 * One photo of a student's notebook, with «لفّ الصورة».
 *
 * A phone photo of a page lands sideways often enough that reading it meant
 * turning the laptop. The turn is a CSS transform on the `<img>` — never a
 * re-fetch, never a re-upload — so the private, permission-checked route the
 * page explains is the only thing that ever serves the bytes. Not persisted:
 * he turns it to read it, not to fix the file.
 *
 * ⚠️ A transform does not move the layout box. Turned a quarter, a landscape
 * shot keeps its landscape box and the page it shows is cut off top and
 * bottom. So on a quarter turn the frame takes the TURNED aspect ratio, and the
 * image is sized and offset inside it (percent margins resolve against the
 * frame's width, on both axes) so that, once turned, it fills the frame exactly.
 * `margin-inline-start` rather than a left offset keeps it centred in RTL.
 */
export function HomeworkImage({
  src,
  alt,
  eager,
  rotateLabel,
}: {
  src: string;
  alt: string;
  eager: boolean;
  rotateLabel: string;
}) {
  const [turns, setTurns] = useState(0);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const quarter = turns % 2 === 1 && size !== null;
  const ratio = size === null ? 1 : size.w / size.h;

  return (
    <div
      className="relative overflow-hidden"
      style={size === null ? undefined : { aspectRatio: quarter ? `${size.h} / ${size.w}` : `${size.w} / ${size.h}` }}
    >
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) setSize({ w: naturalWidth, h: naturalHeight });
        }}
        style={{
          transform: `rotate(${turns * 90}deg)`,
          ...(quarter
            ? {
                width: `${ratio * 100}%`,
                maxWidth: 'none',
                marginInlineStart: `${(1 - ratio) * 50}%`,
                marginTop: `${(ratio - 1) * 50}%`,
              }
            : null),
        }}
        className="block w-full origin-center"
      />
      <button
        type="button"
        onClick={() => setTurns((t) => (t + 1) % 4)}
        aria-label={rotateLabel}
        title={rotateLabel}
        className="absolute end-2 top-2 inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface-1/90 text-fg-muted shadow-sm hover:text-fg"
      >
        <RotateCw className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
