import { notFound } from 'next/navigation';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import { SocialConnectionSchema } from '@ayman/contracts/social/posts';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { can, getSession } from '@/lib/session';
import { MarketingTabs } from '../../tabs';
import { ConnectionForm } from './connection-form';
import '../posts.css';

export const metadata = { title: socialPostsCopy.connection.title };

/**
 * `/admin/marketing/posts/settings` — the Facebook Page and Instagram account
 * the studio publishes to.
 *
 * The read here carries `tokenSet` and the last four characters, never the
 * token (`SocialConnectionService.read`), so this page could not leak it
 * even if it tried. Writing needs `social:publish`, the same permission as
 * publishing: whoever may set the Page token may post as the Page.
 */
export default async function SocialConnectionPage() {
  if (!(await getEntitlements()).socialPosts) notFound();
  const session = await getSession();
  if (!can(session, 'social:publish')) notFound();

  const connection = await adminGet('/api/admin/social/connection', SocialConnectionSchema);

  return (
    <>
      <MarketingTabs />
      <ConnectionForm initial={connection} />
    </>
  );
}
