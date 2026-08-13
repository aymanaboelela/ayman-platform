import { cn } from '@ayman/ui/lib/cn';

/**
 * المساعد's face — one robot, drawn once, used at 28px in the signed-in topbar
 * and at 96px on the error screen.
 *
 * ## Why the visor is a console
 *
 * The obvious mascot for a support widget is a speech bubble or a headset, and
 * the obvious robot is two round eyes and an antenna — which is every robot,
 * for every product. This one belongs to THIS product because of one detail:
 * the visor is a terminal. A dark inset rectangle with something blinking in it
 * is the single image every student on a programming course recognises on
 * sight, and it is what the whole platform is teaching them to read.
 *
 * Everything else is restraint around that one idea. The ember on the antenna
 * is the only colour on the body, and it is the same amber the dragon breathes
 * on the landing page — one light source across the brand, rather than a second
 * accent invented for a second mascot.
 *
 * ## Two moods, and no more
 *
 * `happy` idles: it floats, the ember pulses, the eyes blink on their own
 * clock, and they arc into a laugh on hover or focus. That is the «بيضحك
 * وبيلعب» the launcher was asked for.
 *
 * `stuck` is the error screen. It is deliberately NOT a sad face — a mascot
 * looking miserable at someone whose page just failed is the interface
 * apologising, which the copy already refuses to do. Instead the visor shows
 * the three dots a console prints while it is still working, and the head
 * sways. It reads as "on it", which is both friendlier and true.
 *
 * ## No JavaScript
 *
 * Every state here is CSS: keyframes for the idle loop, `:hover`/`:focus-visible`
 * on the button ancestor for the laugh. Motion has a per-element cost this
 * cannot justify — the launcher is on every route the student can reach — and
 * `packages/ui/src/tokens/motion.css` already zeroes every animation in the
 * product under `prefers-reduced-motion`, so the robot goes still for free and
 * cannot be forgotten.
 *
 * `aria-hidden` throughout: on the launcher the button carries the accessible
 * name, and on the error screen the heading beside it does. A named decoration
 * would announce twice.
 */
export function AssistantRobot({
  mood = 'happy',
  className,
  style,
}: {
  mood?: 'happy' | 'stuck';
  className?: string;
  /** Where `--robot-size` is set. Every caller draws this at a different size. */
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      style={style}
      className={cn('robot', mood === 'stuck' && 'robot--stuck', className)}
    >
      {/* The antenna, and the one warm thing on the whole figure. */}
      <line className="robot__stalk" x1="24" y1="10.5" x2="24" y2="6" />
      <circle className="robot__ember" cx="24" cy="4" r="2.6" />

      {/* Side vents — two bars, so the head reads as built rather than drawn. */}
      <rect className="robot__vent" x="4.5" y="19" width="3" height="8" rx="1.5" />
      <rect className="robot__vent" x="40.5" y="19" width="3" height="8" rx="1.5" />

      {/* Everything that moves as one piece hangs off this group, so the sway
          and the float are single transforms rather than one per part. */}
      <g className="robot__head">
        <rect className="robot__shell" x="8" y="10.5" width="32" height="27" rx="9.5" />
        <rect className="robot__visor" x="12.5" y="15.5" width="23" height="13.5" rx="6.75" />

        {/*
          Both eye sets are drawn and cross-faded, rather than one set being
          morphed. A `<rect>` cannot become a `<path>`, and animating `d` is a
          SMIL/Motion job for something that is two shapes and a fade.
        */}
        <g className="robot__eyes">
          <rect className="robot__eye" x="17.4" y="19.6" width="4.4" height="5.4" rx="2.2" />
          <rect className="robot__eye" x="26.2" y="19.6" width="4.4" height="5.4" rx="2.2" />
        </g>
        <g className="robot__laugh">
          <path d="M17.2 24.2q2.4-4 4.8 0" />
          <path d="M26 24.2q2.4-4 4.8 0" />
        </g>

        {/* The console's «still working» dots. Only `stuck` shows them, and
            they run in sequence rather than together — three lamps blinking at
            once is a warning light, one after another is a process. */}
        <g className="robot__dots">
          <circle cx="18.5" cy="22.3" r="1.5" />
          <circle cx="24" cy="22.3" r="1.5" />
          <circle cx="29.5" cy="22.3" r="1.5" />
        </g>

        {/* The mouth grille — three teeth of a speaker, kept faint so the visor
            stays the thing you look at. */}
        <rect className="robot__grille" x="19" y="32" width="10" height="2.4" rx="1.2" />
      </g>

      {/* The collar the head sits on. It does not move with the head, which is
          what makes the sway read as a head turning rather than the whole
          figure leaning. */}
      <rect className="robot__collar" x="16.5" y="38.5" width="15" height="3.4" rx="1.7" />
    </svg>
  );
}
