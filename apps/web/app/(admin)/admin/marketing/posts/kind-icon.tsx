import { Award, BookOpen, ChartColumn, Clapperboard, Newspaper, Trophy, type LucideIcon } from 'lucide-react';
import type { SocialPostKind } from '@ayman/contracts/social/posts';

/** One icon per source, the same in the inbox, the calendar and the editor. */
export const KIND_ICONS: Record<SocialPostKind, LucideIcon> = {
  honor: Trophy,
  results: ChartColumn,
  certificates: Award,
  course: BookOpen,
  lecture: Clapperboard,
  news: Newspaper,
};

export function KindIcon({ kind, className }: { kind: SocialPostKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return <Icon className={className} aria-hidden="true" />;
}
