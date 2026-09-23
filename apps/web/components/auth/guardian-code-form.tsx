'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { GUARDIAN_CODE_LENGTH } from '@ayman/contracts/guardian';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { CSRF_HEADER, readCsrfToken } from '@/lib/csrf';

const c = copy.auth.guardian;

/**
 * دخول ولي الأمر — حقل واحد، الكود.
 *
 * ## مفيش إيميل ولا كلمة سر
 *
 * ولي الأمر مالوش حساب على المنصة، والكود هو اللي بيثبت إنه مصرّح له. أي
 * حقل تاني هنا كان هيوعد بحساب مش موجود — و«نسيت كلمة السر» على حاجة
 * مالهاش كلمة سر بتبعت الأب لطريق مقفول.
 *
 * ## `dir="ltr"` وتكبير تلقائي
 *
 * الكود ٢٦ حرف لاتيني والصفحة عربي، فمن غير `dir` بيتقلب وهو بيتكتب. والأب
 * بيكتب في تليفون كيبورده بيبدأ صغير — والتكبير هنا عشان يشوف اللي كتبه زي
 * ما هو مخزّن، مش عشان الفحص (العقد بيكبّر برضه على السيرفر).
 */
export function GuardianCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const cleaned = code.replace(/\s+/g, '');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    /*
     * نداء مباشر من المتصفح عبر الـrewrite بتاع `/api/:path*`، مش Server
     * Action — نفس اللي دخول الطالب ماشي عليه بالحرف.
     *
     * السبب إن **السيرفر هو اللي بيحط الكوكي**: `__Host-` بيلزم إن الكوكي
     * تتكتب من نفس الأصل، والـServer Action كان لازم يقرا `Set-Cookie` من
     * رد الـAPI ويعيد كتابته بإيده — خطوة زيادة بتنسخ سياسة الكوكي في
     * مكانين، وأول ما يختلفوا الجلسة بتقع من غير سبب باين.
     */
    let ok = false;
    try {
      const response = await fetch('/api/guardian/sign-in', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          [CSRF_HEADER]: readCsrfToken() || 'guardian-sign-in',
        },
        body: JSON.stringify({ code: cleaned }),
      });
      ok = response.ok;
    } catch {
      // الشبكة وقعت. نفس الرسالة — الأب مايفرقش معاه السبب.
    }
    setPending(false);

    if (ok) {
      router.push('/guardian');
      return;
    }
    // ⚠️ رسالة واحدة لكل الأسباب، زي السيرفر بالظبط: رسالة بتفرّق بين «كود
    // غلط» و«الحساب متقفل» بتقول لأي حد إن الكود ده صح — وده معلومة عن
    // حساب مش بتاعه.
    setError(c.failed);
  }

  return (
    /*
     * ⚠️ `method="post"` — والحارس (`form-method.test.ts`) مسكها.
     *
     * الفورم من غير `method` بيرسل **GET**، والمارك‌أب موجود في الـHTML قبل
     * ما React يربط `onSubmit`. فدوسة في النافذة دي بيتعامل معاها المتصفح:
     * بيعيد تحميل الصفحة والكود في المسار — `/login?code=…`.
     *
     * والكود ده مفتاح بيفتح سجل الطالب كامل. في المسار معناه في تاريخ
     * المتصفح، وفي `Referer` الطلب اللي بعده، وفي لوج كل بروكسي في الطريق.
     * ودي بالظبط الحالة اللي `guardian.controller.ts` كاتب إنها السبب إن
     * الكود في الجسم مش في المسار — والفورم كان هيلفّ حوالين القرار ده.
     */
    <form method="post" onSubmit={(event) => void submit(event)} className="auth-form">
      <p className="auth-notice" role="status">
        {c.hint}
      </p>

      <div>
        <Label htmlFor="guardian-code">{c.codeLabel}</Label>
        <Input
          id="guardian-code"
          name="code"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={GUARDIAN_CODE_LENGTH + 6}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          className="mono tracking-[0.12em]"
        />
      </div>

      {error ? (
        <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || cleaned.length !== GUARDIAN_CODE_LENGTH}>
        {pending ? c.signingIn : c.signIn}
      </Button>
    </form>
  );
}
