import * as m from 'motion/react-m';
import { copy } from '@ayman/contracts';
import { motionPresets } from '@ayman/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { asMotionTarget } from '@/lib/motion-cast';

export default function HomePage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-[var(--w-shell)] flex-col justify-center px-6">
      {/*
        The <h1> is the LCP element. It carries no motion props at all, so its
        text paints on the server-rendered frame with no inline opacity.
        Only the metadata above and below it moves, and only on the y axis:
        `heroLcpSafe` has no `opacity` key precisely because Motion serialises
        `initial` into the SSR'd inline style.
      */}
      <div className="mb-3 flex items-center justify-between">
        <m.p
          className="eyebrow"
          initial={asMotionTarget(motionPresets.heroLcpSafe.initial)}
          animate={asMotionTarget(motionPresets.heroLcpSafe.animate)}
        >
          {copy.home.eyebrow}
        </m.p>
        <ThemeToggle />
      </div>

      <h1 className="text-[length:var(--fs-display-2)] font-semibold leading-[var(--lh-display-2)]">
        {copy.site.name}
      </h1>

      <m.p
        className="mt-4 max-w-[var(--w-prose)] text-fg-muted"
        initial={asMotionTarget(motionPresets.heroLcpSafe.initial)}
        animate={asMotionTarget(motionPresets.heroLcpSafe.animate)}
      >
        {copy.site.tagline}
      </m.p>
    </main>
  );
}
