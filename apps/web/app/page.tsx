import * as m from 'motion/react-m';
import { copy } from '@ayman/contracts';
import { motionPresets } from '@ayman/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { asMotionTarget } from '@/lib/motion-cast';
import { HeroShaderLayer } from '@/components/atmosphere/hero-shader-layer';
import { ShowpieceMount } from '@/components/atmosphere/showpiece-mount';
import { Reveal, RevealItem } from '@/components/motion/reveal';

export default function HomePage() {
  return (
    <main className="relative mx-auto max-w-[var(--w-shell)] px-6">
      <section className="relative flex min-h-dvh flex-col justify-center">
        <HeroShaderLayer />

        {/*
          The <h1> is the LCP element. It carries no motion props at all, so
          its text paints on the server-rendered frame with no inline opacity.
          Only the metadata above and below it moves, and only on the y axis:
          `heroLcpSafe` has no `opacity` key precisely because Motion
          serialises `initial` into the SSR'd inline style.
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
      </section>

      {/*
        Below the fold, on purpose (Task 8's WHOLE point): the three.js chunk
        must never be a candidate for the LCP request, and `ShowpieceMount`
        double-gates the live scene behind `useReducedMotion()` AND a desktop
        media query, so mobile never even requests it. This is also the ONE
        orchestrated `<Reveal>` moment this page uses (Constraint 15) — the
        hero above animates via `heroLcpSafe` directly, not `<Reveal>`.
      */}
      <Reveal className="mx-auto max-w-[var(--w-prose)] py-24 text-center">
        <RevealItem>
          <h2 className="mb-8 text-[length:var(--fs-title-2)] font-semibold">
            {copy.showpiece.heading}
          </h2>
        </RevealItem>
        <RevealItem>
          <ShowpieceMount />
        </RevealItem>
      </Reveal>
    </main>
  );
}
