import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import { SocialPostListSchema } from '@ayman/contracts/social/posts';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { SITE_URL } from '@/lib/seo/site-url';
import { can, getSession } from '@/lib/session';
import { calendarRange, isDay, shiftAnchor, todayInCairo, type CalendarView } from '@/lib/social-posts/calendar';
import { tenantName } from '@/lib/tenant';
import { MarketingTabs } from '../tabs';
import { PostsStudio } from './studio';
import './posts.css';

export const metadata = { title: socialPostsCopy.title };

/**
 * `/admin/marketing/posts` — «استوديو البوستات».
 *
 * ## The URL is the calendar
 *
 * `?view=week|month&d=YYYY-MM-DD`, like `/admin/leaderboard`'s filters: the
 * back button walks the weeks, and «النهارده» is a plain link. The window the
 * API is asked for is computed with the SAME `calendarRange` the client grid
 * draws its cells with, in Cairo days.
 *
 * ## Whose name is on the picture
 *
 * `brand.platform` goes through `tenantName(copy.site.platformName)` and the
 * host is this deployment's own `SITE_URL`, resolved HERE, so the canvas code
 * in the browser never decides whose identity a post carries.
 */
export default async function SocialPostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Not «forbidden»: on a stack without the feature this section is not here.
  if (!(await getEntitlements()).socialPosts) notFound();

  const params = await searchParams;
  const view: CalendarView = params.view === 'month' ? 'month' : 'week';
  const requested = typeof params.d === 'string' ? params.d : undefined;
  const today = todayInCairo();
  const anchor = isDay(requested) ? requested : today;
  const range = calendarRange(view, anchor);

  const query = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
  const [list, session] = await Promise.all([
    adminGet(`/api/admin/social/posts?${query.toString()}`, SocialPostListSchema),
    getSession(),
  ]);

  return (
    <>
      <MarketingTabs />
      <PostsStudio
        list={list}
        calendar={{
          view,
          anchor,
          today,
          days: range.days,
          month: range.month,
          previous: shiftAnchor(view, anchor, -1),
          next: shiftAnchor(view, anchor, 1),
        }}
        brand={{ platform: tenantName(copy.site.platformName), siteHost: new URL(SITE_URL).host }}
        canWrite={can(session, 'social:write')}
        canPublish={can(session, 'social:publish')}
      />
    </>
  );
}
