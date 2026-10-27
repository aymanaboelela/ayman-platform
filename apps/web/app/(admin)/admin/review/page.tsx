import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminPaymentListSchema } from '@ayman/contracts/admin/payments';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { can, getSession } from '@/lib/session';
import { ReviewDeck } from './review-deck';
import { REVIEW_QUERY } from './query';

const c = copy.admin.review;

export const metadata = { title: c.eyebrow };

/**
 * `/admin/review` — «مراجعة سريعة»: the pending payments, one card at a time.
 *
 * The same queue as `/admin/payments`, read from the same endpoint, for the
 * moment that screen was never built for: a push lands on a phone, and the
 * answer is a yes or a no on one transfer. The table there is for a desk —
 * five columns, a thumbnail the size of a thumb. Here the screenshot is the
 * whole screen and the two buttons are where the thumb already is.
 *
 * The read sits in its own `<Suspense>`: with `cacheComponents` an uncached
 * fetch at the page's top level is reported as a prerender error in dev
 * («encountered uncached data during prerendering»), and the skeleton is
 * what a phone shows for the half second the queue takes anyway.
 */
export default function AdminReviewPage() {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <ReviewBody />
    </Suspense>
  );
}

/**
 * `notFound()` rather than a 403 on both gates, like every feature-gated
 * admin page: the API is the real lock (`payment:read` on the list route),
 * this only decides whether the page exists.
 */
async function ReviewBody() {
  const [session, features] = await Promise.all([getSession(), getEntitlements()]);
  if (!features.adminMobile || !can(session, 'payment:read')) notFound();

  const initial = await adminGet(
    `/api/admin/payments/submissions?${REVIEW_QUERY}`,
    AdminPaymentListSchema,
  );

  return <ReviewDeck initial={initial} />;
}

function ReviewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-surface-3" />
      <div className="mt-3 h-8 w-56 rounded bg-surface-3" />
      <div className="mt-8 h-[60dvh] rounded-xl border border-line bg-surface-2" />
    </div>
  );
}
