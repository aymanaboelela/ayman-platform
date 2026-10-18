import { Binary, BookOpen, Cpu, Globe, Info, Lock, Palette, Scale, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { PracticeIcon } from '@/lib/practice/catalog';

const ICONS: Record<PracticeIcon, LucideIcon> = {
  cpu: Cpu,
  shield: ShieldCheck,
  globe: Globe,
  palette: Palette,
  info: Info,
  scale: Scale,
  lock: Lock,
  binary: Binary,
  book: BookOpen,
};

/** The unit's icon. Decorative — the unit title beside it carries the meaning. */
export function UnitIcon({ icon, size = 20 }: { icon: PracticeIcon; size?: number }) {
  const Icon = ICONS[icon];
  return <Icon size={size} aria-hidden="true" />;
}
