'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { copy } from '@ayman/contracts/copy/admin';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { adminReferralsCopy } from '@ayman/contracts/copy/admin-referrals';
import { cn } from '@ayman/ui/lib/cn';
import { useFeature } from '@/components/admin/entitlements-context';

const c = copy.marketing;

const TABS = [
  { href: '/admin/marketing/campaigns', label: c.title },
  { href: '/admin/marketing/device', label: c.deviceTitle },
  { href: '/admin/marketing/opt-outs', label: c.optOutsTitle },
  // «دعوة الصحاب» — behind its own entitlement, hidden below where it is off.
  { href: '/admin/marketing/referrals', label: adminReferralsCopy.tab, feature: 'referrals' },
] as const;

/**
 * «الرد الآلي»'s two screens, shown only where the `whatsapp.bot` entitlement
 * is on — the API answers 404 there otherwise, and a tab to a 404 is worse
 * than no tab. Its inbox lives under «صندوق الوارد», beside المساعد's.
 */
const BOT_TABS = [
  { href: '/admin/marketing/leads', label: bot.admin.tabLeads },
  { href: '/admin/marketing/bot', label: bot.admin.tabBot },
] as const;

/**
 * The screens behind «التسويق»: campaigns, the device that sends them, who has
 * opted out of ever receiving one, «دعوة الصحاب» where that is open, and the
 * auto-reply bot's leads and settings where that is.
 *
 * A client component only for `usePathname` — the tab bar itself renders the
 * same three links on every page under this section, and each page decides
 * its own content.
 */
export function MarketingTabs() {
  const pathname = usePathname();
  const referrals = useFeature('referrals');
  const botOn = useFeature('whatsapp.bot');
  const tabs = [
    ...TABS.filter((tab) => !('feature' in tab) || referrals),
    ...(botOn ? BOT_TABS : []),
  ];

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line-subtle">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 px-3 py-2 text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms]',
              active
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
