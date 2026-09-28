'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { Button } from '@ayman/ui/components/button';
import { CSRF_HEADER, readCsrfToken } from '@/lib/csrf';

/**
 * خروج ولي الأمر.
 *
 * الكوكي `__Host-` و`httpOnly`، فالسيرفر بس اللي يقدر يمسحها. وبعدها
 * تحميل صفحة كامل لـ`/login` مش `router.push`: كاش الراوتر لسه ماسك
 * `/guardian` مرسومة، ورجوع بالسهم كان هيورّي بيانات الابن من غير كوكي.
 * ولو النداء فشل بنروح برضه — الكوكي بتخلص لوحدها، والأب مايتحبسش.
 */
export function GuardianSignOut() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch('/api/guardian/sign-out', {
      method: 'POST',
      headers: { [CSRF_HEADER]: readCsrfToken() },
    }).catch(() => null);
    window.location.assign('/login');
  }

  return (
    <Button type="button" variant="ghost" onClick={signOut} disabled={pending} aria-busy={pending}>
      <LogOut className="size-4" aria-hidden="true" />
      {pending ? copy.nav.loggingOut : copy.nav.logout}
    </Button>
  );
}
