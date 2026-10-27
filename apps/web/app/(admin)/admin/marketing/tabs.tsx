import { copy } from '@ayman/contracts/copy/admin';
import { adminReferralsCopy } from '@ayman/contracts/copy/admin-referrals';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import { getEntitlements } from '@/lib/entitlements';
import { MarketingTabsNav, type MarketingTab } from './tabs-nav';

const c = copy.marketing;

/**
 * The screens behind «التسويق»: campaigns, the device that sends them, who
 * has opted out of ever receiving one, «دعوة الصحاب», and the social post
 * studio.
 *
 * Three features share this section, and any of them can be off on a stack:
 * a teacher entitled to the studio and not to WhatsApp must not see three tabs
 * that all 404. So the tabs are picked here, on the server, from the same
 * entitlements each page's own `notFound()` reads.
 */
export async function MarketingTabs() {
  const features = await getEntitlements();
  const tabs: MarketingTab[] = [
    ...(features['marketing.whatsapp']
      ? [
          { href: '/admin/marketing/campaigns', label: c.title },
          { href: '/admin/marketing/device', label: c.deviceTitle },
          { href: '/admin/marketing/opt-outs', label: c.optOutsTitle },
        ]
      : []),
    ...(features.referrals ? [{ href: '/admin/marketing/referrals', label: adminReferralsCopy.tab }] : []),
    ...(features.socialPosts ? [{ href: '/admin/marketing/posts', label: socialPostsCopy.tab }] : []),
  ];

  return <MarketingTabsNav tabs={tabs} />;
}
