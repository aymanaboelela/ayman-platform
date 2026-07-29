'use client';

import dynamic from 'next/dynamic';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * React Bits' `RotatingText` wrapped for this codebase — the hero's second line,
 * cycling through a few phrasings of the same promise.
 *
 * Two guards, both here rather than in the vendored file so a re-fetch cannot
 * drop them:
 *
 * - **Reduced motion renders the first phrase, statically.** Text that
 *   rearranges itself on a timer is unreadable for anyone who asked for less
 *   motion, and unlike a decorative backdrop it cannot simply be omitted — it
 *   is the headline.
 * - **Lazy and client-only.** The effect is meaningless in the SSR'd HTML, and
 *   the static first phrase is what search engines and the pre-hydration paint
 *   should see anyway.
 *
 * The vendored component splits each phrase into characters and staggers them,
 * so the wrapper hands it Arabic strings and lets it do the splitting — see
 * `vendor/rotating-text.tsx` for the two adaptations that file needed to run
 * under this app's `LazyMotion strict` provider.
 */
const RotatingText = dynamic(() => import('@/components/site/vendor/rotating-text'), {
  ssr: false,
  loading: () => null,
});

export function RotatingHeadline({
  phrases,
  className,
}: {
  phrases: readonly string[];
  className?: string;
}) {
  // `true` before hydration, so the server and the hydrating render both emit
  // the static phrase and the rotation starts only once it is safe.
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', true);

  if (reduced || phrases.length < 2) return <span className={className}>{phrases[0]}</span>;

  return (
    <RotatingText
      texts={[...phrases]}
      mainClassName={className}
      // WORDS, never characters. Arabic is cursive: every letter has initial,
      // medial, final and isolated forms chosen by its neighbours, and putting
      // each one in its own element severs those joins — "مش" renders as two
      // disconnected isolated glyphs. Splitting on whitespace keeps each word's
      // shaping intact, which is the only correct unit for this script.
      splitBy="words"
      staggerFrom="last"
      staggerDuration={0.05}
      rotationInterval={2800}
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '-110%', opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
    />
  );
}
