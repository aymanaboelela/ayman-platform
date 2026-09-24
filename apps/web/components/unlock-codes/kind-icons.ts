import {
  CalendarDays,
  CalendarRange,
  GraduationCap,
  Layers,
  PlayCircle,
  type LucideIcon,
} from 'lucide-react';
import type { UnlockTargetKind } from '@ayman/contracts/unlock-codes';

/**
 * One icon per kind of thing a code opens — shared by the success screen (a
 * client component) and the history list (a server one). Its own module and
 * not an export of `redeem-form.tsx`: a value exported from a `'use client'`
 * file reaches a Server Component as a reference, not as the map.
 */
export const KIND_ICON: Record<UnlockTargetKind, LucideIcon> = {
  course: GraduationCap,
  term: CalendarRange,
  month: CalendarDays,
  section: Layers,
  lesson: PlayCircle,
};
