import type { CSSProperties } from 'react';
import {
  Ban,
  CalendarDays,
  CalendarRange,
  CircleCheckBig,
  GraduationCap,
  Layers,
  MonitorPlay,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import type { UnlockCodeStatus } from '@ayman/contracts/admin/unlock-codes';
import type { UnlockTargetKind } from '@ayman/contracts/unlock-codes';
import { cn } from '@ayman/ui/lib/cn';

/**
 * The screen's colour vocabulary, shared by the list (a Server Component) and
 * the generator (a client one) so a «وحدة» chip is the same blue in both.
 *
 * ONE custom property, `--uc-tone`, set per element and read by a handful of
 * fixed class strings — rather than a class string per colour per shape, which
 * is five kinds × three statuses × four shapes of near-identical arbitrary
 * values that would drift the first time one of them is tuned.
 *
 * Every wash mixes in `oklab`, never `oklch`: the dark neutrals are navy, and
 * an `oklch` mix with them rotates red and green toward violet — see
 * `lib/neutral-mix-space.test.ts`.
 */
export function tone(color: string): CSSProperties {
  return { '--uc-tone': color } as CSSProperties;
}

/** A tinted surface — tiles, the ticket, the picked state of a pick card. */
export const TINT_CARD =
  'border border-[color-mix(in_oklab,var(--uc-tone)_32%,var(--border))] bg-[color-mix(in_oklab,var(--uc-tone)_9%,var(--n-2))]';
/** The icon well inside a tinted surface. */
export const TINT_WELL =
  'bg-[color-mix(in_oklab,var(--uc-tone)_18%,var(--n-2))] text-[color:var(--uc-tone)]';
/** Text in the tone, pulled toward the foreground so it clears contrast on
 *  both themes — the raw chart hues are only guaranteed 3:1. */
export const TONE_TEXT = 'text-[color:color-mix(in_oklab,var(--uc-tone)_78%,var(--n-12))]';

/** Categorical, from the chart palette — kinds are identities, not states, so
 *  none of them borrows `--ok`/`--err`, which the status badge beside them
 *  already means something by. */
export const KIND_META: Record<UnlockTargetKind, { icon: LucideIcon; color: string }> = {
  course: { icon: GraduationCap, color: 'var(--viz-1)' },
  term: { icon: CalendarRange, color: 'var(--viz-3)' },
  month: { icon: CalendarDays, color: 'var(--viz-2)' },
  section: { icon: Layers, color: 'var(--viz-5)' },
  lesson: { icon: MonitorPlay, color: 'var(--viz-4)' },
};

export const STATUS_META: Record<UnlockCodeStatus, { icon: LucideIcon; color: string }> = {
  unused: { icon: Ticket, color: 'var(--info)' },
  used: { icon: CircleCheckBig, color: 'var(--ok)' },
  revoked: { icon: Ban, color: 'var(--err)' },
};

/**
 * One piece a code opens, as a pill: kind icon in its colour, then the title.
 * `hint` rides in `title` — «الوحدة ٣ ← المحاضرة ٢» is too long for the pill
 * itself on a phone, and the lecture's own name is the part that identifies it.
 */
export function KindChip({
  kind,
  label,
  hint,
  className,
}: {
  kind: UnlockTargetKind;
  label: string;
  hint?: string;
  className?: string;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      style={tone(meta.color)}
      title={hint ?? label}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-2.5 py-1',
        'text-[length:var(--fs-text-xs)] font-medium text-fg',
        TINT_CARD,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0 text-[color:var(--uc-tone)]" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

/** «متاح» / «اتستخدم» / «اتلغى», coloured and iconed. */
export function StatusBadge({ status, label }: { status: UnlockCodeStatus; label: string }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      style={tone(meta.color)}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1',
        'text-[length:var(--fs-text-xs)] font-semibold',
        TINT_CARD,
        TONE_TEXT,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * A code as the student will read it: monospace, spaced, and isolated LTR so
 * the Arabic line around it cannot reorder `K7M2QX` into `XQ2M7K`.
 */
export function CodeText({ code, className }: { code: string; className?: string }) {
  return (
    <span
      dir="ltr"
      className={cn(
        'font-mono font-semibold tracking-[0.16em] text-fg [unicode-bidi:isolate]',
        className,
      )}
    >
      {code}
    </span>
  );
}
