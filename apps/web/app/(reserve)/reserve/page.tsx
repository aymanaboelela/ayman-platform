import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { featureEnabled } from '@/lib/entitlements';
import { tenantName } from '@/lib/tenant';
import { ReserveFlow } from './reserve-flow';

const p = reservationsCopy.page;

export const metadata: Metadata = {
  title: p.title,
  description: p.metaDescription,
};

/**
 * `/reserve` — «سنتر ولا أونلاين؟», then the centre, the form, the group and the payment.
 *
 * The page's content (open or closed, the centres, their groups and prices) is fetched by
 * the browser, not here. Two reasons, both paid for elsewhere: a server read
 * made with `cacheComponents` is either cached — and the build would bake a
 * «closed» page in with no API to ask (see `lib/settings.ts`) — or live, and
 * then every visitor's render is the WEB container's request, one address for
 * the whole country against the API's per-address rate limit. From the
 * browser, each visitor is their own bucket and the answer is always current.
 */
export default async function ReservePage() {
  if (!(await featureEnabled('centerReservations'))) notFound();
  return <ReserveFlow brand={tenantName(copy.site.name)} />;
}
