import type { HomeBlockProps } from '@ayman/contracts/admin/home-blocks';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';

/**
 * A compact, faithful-shape preview per block type — not a re-export of the
 * public homepage's own components. The landing page renders these blocks at
 * full scale with GSAP pins, a WebGL backdrop and a video mascot; mounting any
 * of that inside a 300px admin cell is neither useful nor cheap. This shows an
 * editor the words they typed, in roughly the arrangement they will appear.
 *
 * `instructor` and `yearTracks` carry no props at all (they build themselves
 * from the catalogue and the taxonomy), so their preview is a label rather
 * than an empty box — see `packages/contracts/src/admin/home-blocks.ts`.
 *
 * No `FAQPage` JSON-LD anywhere near this — this is an admin preview, and
 * the public FAQ block itself must never emit it either (spec §5.1: Google
 * removed the rich-result documentation on 2026-06-15).
 */
export function BlockPreview({ props }: { props: HomeBlockProps }) {
  switch (props.type) {
    case 'hero':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4 text-center">
          {props.eyebrowAr ? (
            <p className="text-[length:var(--fs-text-xs)] text-accent-text">{props.eyebrowAr}</p>
          ) : null}
          <p className="text-[length:var(--fs-title-3)] font-semibold text-fg">{props.headlineAr}</p>
          {props.subheadlineAr ? <p className="text-fg-muted">{props.subheadlineAr}</p> : null}
          {props.ctaLabelAr ? <Badge tone="accent">{props.ctaLabelAr}</Badge> : null}
          {props.stats.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-3 pt-1">
              {props.stats.map((stat, index) => (
                <span key={index} className="text-[length:var(--fs-text-xs)] text-fg-muted">
                  <b className="tabular-nums text-accent-text">{stat.value}</b> {stat.labelAr}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    case 'whyRail':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4">
          <p className="font-[var(--fw-medium)] text-fg">
            {props.titleAr} <span className="text-accent-text">{props.titleAccentAr}</span>
          </p>
          <div className="flex gap-2 overflow-hidden">
            {props.items.slice(0, 3).map((item, index) => (
              <div
                key={index}
                className="min-w-0 flex-1 rounded-[var(--r-sm)] bg-surface-4 p-2 text-[length:var(--fs-text-xs)]"
              >
                <p className="truncate font-[var(--fw-medium)] text-fg">{item.titleAr}</p>
                <p className="truncate text-fg-muted">{item.bodyAr}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'instructor':
    case 'yearTracks':
      return (
        <div className="rounded-[var(--r-md)] border border-dashed border-line bg-surface-3 p-4">
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.admin.home.placementOnly}</p>
        </div>
      );
    case 'about':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4">
          <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p>
          <p className="line-clamp-2 text-[length:var(--fs-text-xs)] text-fg-muted">{props.body1Ar}</p>
          {props.chipsAr.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {props.chipsAr.map((chip, index) => (
                <Badge key={index}>{chip}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      );
    case 'courseGrid':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4">
          <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: Math.min(props.limit, 6) }).map((_, index) => (
              <div key={index} className="h-10 rounded-[var(--r-sm)] bg-surface-4" />
            ))}
          </div>
        </div>
      );
    case 'books':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4">
          <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p>
          {/* Taller placeholders than the course grid's, because the real
              cards are 3/4 covers and a preview that shows them as the same
              flat strip misrepresents how much page this section takes. */}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: Math.min(props.limit, 6) }).map((_, index) => (
              <div key={index} className="h-14 rounded-[var(--r-sm)] bg-surface-4" />
            ))}
          </div>
        </div>
      );
    case 'stats':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4">
          {props.titleAr ? <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p> : null}
          <div className="flex flex-wrap gap-4">
            {props.items.map((item, index) => (
              <div key={index} className="text-center">
                <p className="text-[length:var(--fs-title-3)] tabular-nums text-accent-text">{item.value}</p>
                <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{item.labelAr}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'testimonials':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4">
          {props.titleAr ? <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p> : null}
          {props.items.slice(0, 2).map((item, index) => (
            <div key={index} className="rounded-[var(--r-sm)] bg-surface-4 p-2">
              <p className="text-[length:var(--fs-text-sm)] text-fg">{item.bodyAr}</p>
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{item.nameAr}</p>
            </div>
          ))}
        </div>
      );
    case 'faq':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4">
          {props.titleAr ? <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p> : null}
          {props.items.slice(0, 2).map((item, index) => (
            <div key={index}>
              <p className="text-[length:var(--fs-text-sm)] font-[var(--fw-medium)] text-fg">{item.questionAr}</p>
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{item.answerAr}</p>
            </div>
          ))}
        </div>
      );
    case 'cta':
      return (
        <div className="space-y-2 rounded-[var(--r-md)] bg-surface-3 p-4 text-center">
          <p className="font-[var(--fw-medium)] text-fg">{props.headlineAr}</p>
          <Badge tone="accent">{props.ctaLabelAr}</Badge>
        </div>
      );
    default:
      return null;
  }
}
