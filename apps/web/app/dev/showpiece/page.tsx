'use client';

import dynamic from 'next/dynamic';

const Showpiece = dynamic(() => import('@/components/atmosphere/showpiece'), { ssr: false });

/**
 * A bare 640×480 render of the showpiece scene, with no chrome around it.
 *
 * This is how `public/showpiece-poster.webp` gets (re)generated: load this
 * page at exactly 640×480, screenshot the canvas, resize/convert to WebP at
 * quality 82. Not linked from anywhere — `app/dev/*` is the design-system
 * playground, exempt from the no-literal-strings and route-coverage rules.
 */
export default function ShowpiecePosterPage() {
  return (
    <div style={{ width: 640, height: 480 }}>
      <Showpiece />
    </div>
  );
}
