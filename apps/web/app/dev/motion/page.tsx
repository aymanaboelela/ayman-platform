import * as m from 'motion/react-client';
import { motionPresets } from '@ayman/ui';
import { asMotionTarget } from '@/lib/motion-cast';

/**
 * `motion/react-client` is the Server-Component entry point: it re-exports the
 * same components already marked with the client directive, so a Server
 * Component can render one without becoming a Client Component itself.
 *
 * Unlike `motion/react`'s `m`, this module has no `LazyMotion` context to hang
 * a namespace object off — it exports each tag (`div`, `span`, …) directly —
 * so the namespace import (`import * as m`) is what reconstructs the familiar
 * `m.div` call shape.
 */
export default function MotionProbePage() {
  return (
    <main className="mx-auto max-w-[var(--w-prose)] px-6 py-16">
      <m.div
        initial={asMotionTarget(motionPresets.heroLcpSafe.initial)}
        animate={asMotionTarget(motionPresets.heroLcpSafe.animate)}
        className="rounded-lg border border-line p-6"
      >
        server component · m from motion/react-client
      </m.div>
    </main>
  );
}
