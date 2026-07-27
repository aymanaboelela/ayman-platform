import type { HomeBlockProps } from '@ayman/contracts/admin/home-blocks';
import { Badge } from '@ayman/ui';

/**
 * A compact, faithful-shape preview per block type — not a re-export of the
 * public homepage's own components, because the public `/` page does not
 * consume `home_blocks` yet (that page is out of this task's file list; see
 * the resume report). This is what makes the composer read as WYSIWYG
 * rather than a form over opaque JSON in the meantime: an admin sees the
 * headline, the stat numbers, the FAQ text — not a JSON blob.
 *
 * No `FAQPage` JSON-LD anywhere near this — this is an admin preview, and
 * the public FAQ block itself must never emit it either (spec §5.1: Google
 * removed the rich-result documentation on 2026-06-15).
 */
export function BlockPreview({ props }: { props: HomeBlockProps }) {
  switch (props.type) {
    case 'hero':
      return (
        <div className="space-y-8 rounded-[var(--r-md)] bg-surface-3 p-16 text-center">
          <p className="text-[length:var(--fs-title-3)] font-semibold text-fg">{props.headlineAr}</p>
          {props.subheadlineAr ? <p className="text-fg-muted">{props.subheadlineAr}</p> : null}
          {props.ctaLabelAr ? <Badge tone="accent">{props.ctaLabelAr}</Badge> : null}
        </div>
      );
    case 'courseGrid':
      return (
        <div className="space-y-8 rounded-[var(--r-md)] bg-surface-3 p-16">
          <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p>
          <div className="grid grid-cols-3 gap-8">
            {Array.from({ length: Math.min(props.limit, 6) }).map((_, index) => (
              <div key={index} className="h-40 rounded-[var(--r-sm)] bg-surface-4" />
            ))}
          </div>
        </div>
      );
    case 'stats':
      return (
        <div className="space-y-8 rounded-[var(--r-md)] bg-surface-3 p-16">
          {props.titleAr ? <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p> : null}
          <div className="flex flex-wrap gap-16">
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
        <div className="space-y-8 rounded-[var(--r-md)] bg-surface-3 p-16">
          {props.titleAr ? <p className="font-[var(--fw-medium)] text-fg">{props.titleAr}</p> : null}
          {props.items.slice(0, 2).map((item, index) => (
            <div key={index} className="rounded-[var(--r-sm)] bg-surface-4 p-8">
              <p className="text-[length:var(--fs-text-sm)] text-fg">{item.bodyAr}</p>
              <p className="mt-4 text-[length:var(--fs-text-xs)] text-fg-muted">{item.nameAr}</p>
            </div>
          ))}
        </div>
      );
    case 'faq':
      return (
        <div className="space-y-8 rounded-[var(--r-md)] bg-surface-3 p-16">
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
        <div className="space-y-8 rounded-[var(--r-md)] bg-surface-3 p-16 text-center">
          <p className="font-[var(--fw-medium)] text-fg">{props.headlineAr}</p>
          <Badge tone="accent">{props.ctaLabelAr}</Badge>
        </div>
      );
    default:
      return null;
  }
}
