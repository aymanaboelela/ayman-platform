import { NeonCommand, NeonHead, NeonWindow } from './neon-chrome';
import { MARKERS } from './neon-copy';

export interface NeonCtaProps {
  headline: string;
  lead: string;
  ctaLabel: string;
  ctaHref: string;
  level: 1 | 2;
}

/**
 * The `cta` block — `// start`. The page's last frame.
 *
 * `<SiteCta>` on the classic page is a dark panel in both themes, because that
 * page is light and needs its closer to be a lit stage. Here the whole page is
 * already that ground, so the closer is distinguished by LIGHT instead: the
 * window is `lit`, which raises its border to the brand colour and puts a glow
 * behind it. It is the only window on the page that carries that at rest apart
 * from the empty-catalogue panel — the two moments where the page is asking
 * for something.
 *
 * One command, and it is the filled one. A closer with a second, quieter link
 * beside it is a closer offering a way out.
 */
export function NeonCta({ headline, lead, ctaLabel, ctaHref, level }: NeonCtaProps) {
  return (
    <section className="neon-section neon-section--closer" id="start">
      <div className="neon-shell">
        {/* Marker only — this section's heading lives inside the window below,
            so `<NeonHead>` is given no title and renders none. */}
        <NeonHead marker={MARKERS.cta} align="center" />

        <div className="neon-closer">
          <NeonWindow file="start.sh" lit>
            {/*
              The headline is an `<h2>` (or the page's `<h1>`, on the vanishing
              case of a block list that is nothing but a `cta`) rather than a
              styled `<p>`: it is the closing section's heading and a document
              outline that skips it has a section with no name in it.
            */}
            {level === 1 ? (
              <h1 className="neon-closer__title">{headline}</h1>
            ) : (
              <h2 className="neon-closer__title">{headline}</h2>
            )}
            {lead ? <p className="neon-closer__lead">{lead}</p> : null}
            <div className="neon-closer__cmd">
              <NeonCommand href={ctaHref} variant="run">
                {ctaLabel}
              </NeonCommand>
            </div>
          </NeonWindow>
        </div>
      </div>
    </section>
  );
}
