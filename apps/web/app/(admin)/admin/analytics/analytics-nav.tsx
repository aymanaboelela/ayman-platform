import { getEntitlements } from '@/lib/entitlements';
import { can, getSession } from '@/lib/session';
import { AnalyticsNavLinks } from './analytics-nav-links';

/**
 * The analytics sub-nav, with the tabs that need more than `analytics:read`
 * decided HERE, on the server.
 *
 * «الفلوس يوم بيوم» is `payment:read` while the rest of «التحليلات» is
 * `analytics:read`, and a role may hold one without the other. A tab that opens
 * onto a 403 is worse than no tab — same rule `FinanceTabs` follows for
 * «السناتر». `getSession` is per-request cached, so the page that already read
 * it pays nothing for this.
 *
 * «مصادر التسجيل» is money too (what each campaign's students paid), and it is
 * also a feature a stack may not have — so it needs the permission AND the
 * entitlement, or the tab opens onto a 404 instead. `getEntitlements` is
 * `'use cache'`d and cannot throw.
 */
export async function AnalyticsNav() {
  const [session, features] = await Promise.all([getSession(), getEntitlements()]);
  const showMoney = can(session, 'payment:read');
  return <AnalyticsNavLinks showMoney={showMoney} showSources={showMoney && features.signupSources} />;
}
