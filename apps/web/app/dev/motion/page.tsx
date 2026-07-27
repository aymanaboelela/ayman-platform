import * as m from 'motion/react-m';
import { motionPresets } from '@ayman/ui';
import { asMotionTarget } from '@/lib/motion-cast';

/**
 * `motion/react-m` is the Server-Component-safe counterpart of `m` from
 * `motion/react`. Note this is deliberately NOT `motion/react-client`:
 * that module (`framer-motion/client`) re-exports the EAGER, fully-featured
 * `motion.*` family (`createMotionComponentWithFeatures`) under plain tag
 * names — the same family `<LazyMotion strict>` exists to reject — so
 * rendering it anywhere inside this app's `MotionProvider` throws exactly
 * the "you rendered a motion component" error `strict` is designed to raise.
 * `motion/react-m` (`framer-motion/m`) re-exports the LAZY family
 * (`createMinimalMotionComponent`, the same factory behind `m` itself) under
 * plain tag names instead, so it is safe inside `<LazyMotion strict>`. It has
 * no `LazyMotion` context to hang a namespace object off — a Server Component
 * cannot consume context — so the namespace import (`import * as m`)
 * reconstructs the familiar `m.div` call shape from the individually
 * exported tags.
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
