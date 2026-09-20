import { copy } from '@ayman/contracts/copy/admin';
import { notFound } from 'next/navigation';
import { getEntitlements } from '@/lib/entitlements';
import { BroadcastForm } from './broadcast-form';

const c = copy.admin.broadcast;

export const metadata = { title: c.title };

/**
 * `/admin/broadcast` — the instructor's own words, sent on purpose.
 *
 * See `AdminBroadcastController`'s header for why this is a route of its
 * own rather than a button added to `/admin/outreach`: that screen's whole
 * design argues against a "send to everyone" control living beside its own
 * automated log, and this page is that control, named for what it is.
 */
export default async function AdminBroadcastPage() {
  /*
   * القسم ده مش موجود على ستاك الفيتشر دي مقفولة فيه — والصف بتاعه في
   * `ADMIN_NAV` مش بيترسم أصلًا. ده الباب لو حد كتب الـURL بإيده.
   *
   * `notFound()` مش ٤٠٣: الصفحة مش «ممنوعة»، هي مش هنا. ونفس الشكل بالحرف
   * اللي `(admin)/layout.tsx` بيستخدمه، وبيشرح ليه فوقه.
   */
  if (!(await getEntitlements()).broadcast) notFound();

  return (
    <>
      <header className="mb-6">
        <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
          {c.eyebrow}
        </p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1.5 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
          {c.lead}
        </p>
      </header>

      <BroadcastForm />
    </>
  );
}
