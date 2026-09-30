import Link from 'next/link';
import { BarChart3, ListChecks, Swords } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { cn } from '@ayman/ui/lib/cn';
import { can, getSession } from '@/lib/session';
import { IS_AYMAN } from '@/lib/tenant';

const c = copy.admin.games;

/**
 * «الأسئلة والإعدادات» و«الإحصائيات» — شاشتين لنفس الموضوع، فتبويبين مش
 * بندين في السايدبار. كل تبويب بصلاحيته (`question:write` و`analytics:read`)،
 * والتبويب اللي هيفتح على 403 مابيظهرش أصلًا — نفس قاعدة `AnalyticsNav`.
 */
export async function GamesTabs({ active }: { active: 'questions' | 'stats' | 'arena' }) {
  const session = await getSession();
  const tabs = [
    { key: 'questions', href: '/admin/games', label: c.tabQuestions, icon: ListChecks, show: can(session, 'question:write') },
    { key: 'stats', href: '/admin/games/stats', label: c.tabStats, icon: BarChart3, show: can(session, 'analytics:read') },
    /*
     * «ساحة التحدي» — نفس صلاحية الإحصائيات. التبويب عند أيمن بس، زي بند
     * الطالب: الفلاج (`arena.enabled`) مقفول افتراضيًا على أي ستاك تاني، والشاشة
     * نفسها بترد «مش موجودة» لو اتقفل.
     */
    { key: 'arena', href: '/admin/games/arena', label: arenaCopy.admin.tab, icon: Swords, show: IS_AYMAN && can(session, 'analytics:read') },
  ].filter((tab) => tab.show);
  if (tabs.length < 2) return null;

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label={c.title}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? 'page' : undefined}
          className={cn(
            'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out',
            active === tab.key ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg',
            active === tab.key && 'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent',
          )}
        >
          <tab.icon className="size-4" aria-hidden="true" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
