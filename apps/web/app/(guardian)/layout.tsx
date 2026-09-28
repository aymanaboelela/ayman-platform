import type { ReactNode } from 'react';
import Link from 'next/link';
// `.tile` — `StatTile` بيرسم نفسه بيه، والملف ده مابيوصلش لصفحة غير من لاي‌أوت.
import '../study.css';
import { copy } from '@ayman/contracts/copy';
import { BrandLockup } from '@/components/brand-lockup';
import { GuardianSignOut } from '@/components/guardian/guardian-sign-out';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import { tenantName } from '@/lib/tenant';

export const metadata = privateRouteMetadata;

/**
 * شِل ولي الأمر — لوجو وزرار خروج، ومفيش غيرهم.
 *
 * ## ليه مش جوّه `(app)`
 *
 * `/guardian` كانت عايشة تحت `(app)`، فكانت بتترسم جوّه شِل الطالب: الريل
 * (`RailCourses`)، والجرس، وقايمة الحساب — وكل واحد فيهم بيقرا راوت طالب
 * (`/api/me/dashboard`، الإشعارات، البروفايل). جلسة ولي الأمر مش جلسة طالب،
 * فالتلاتة بيرجعوا 401 وبيرموا، والصفحة كلها كانت بتقع على «حصلت مشكلة»
 * قبل ما الأب يشوف رقم واحد — مع إن `/api/guardian/me` نفسها كانت شغّالة.
 *
 * وحتى لو اتصلحوا يسكتوا على 401: ريل فيه «كورساتي» و«الألعاب» وجرس
 * إشعارات قدام أب ماعندوش حساب هي وعود بحاجات مش بتاعته.
 */
export default function GuardianLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-line-subtle">
        <div className="mx-auto flex w-full max-w-[var(--w-shell)] items-center justify-between gap-3 px-6 py-3">
          <Link href="/" aria-label={tenantName(copy.site.name)}>
            <BrandLockup showTagline={false} />
          </Link>
          <GuardianSignOut />
        </div>
      </header>
      {children}
    </>
  );
}
