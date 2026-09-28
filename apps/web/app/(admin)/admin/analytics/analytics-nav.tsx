import { can, getSession } from '@/lib/session';
import { AnalyticsNavLinks } from './analytics-nav-links';

/**
 * The analytics sub-nav, with the one tab that needs a different permission
 * decided HERE, on the server.
 *
 * «الفلوس يوم بيوم» is `payment:read` while the rest of «التحليلات» is
 * `analytics:read`, and a role may hold one without the other. A tab that opens
 * onto a 403 is worse than no tab — same rule `FinanceTabs` follows for
 * «السناتر». `getSession` is per-request cached, so the page that already read
 * it pays nothing for this.
 */
export async function AnalyticsNav() {
  const session = await getSession();
  return <AnalyticsNavLinks showMoney={can(session, 'payment:read')} />;
}
