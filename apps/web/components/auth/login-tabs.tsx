'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { LoginForm } from './login-form';
import { GuardianCodeForm } from './guardian-code-form';

const c = copy.auth.guardian;

/**
 * «طالب» / «ولي أمر» — تبويبين فوق فورم الدخول.
 *
 * ## ليه تبويبين مش لينك
 *
 * الأب بيوصل لصفحة الدخول بنفس الطريقة اللي الطالب بيوصل بيها: بيكتب اسم
 * الموقع. لو دخول ولي الأمر كان على صفحة تانية، كان لازم حد يقوله العنوان —
 * والابن اللي بيدّيه الكود مش هيفتكر يقوله لينك كمان.
 *
 * والتبويب مش مخبّي: الأب لازم **يشوف** إن له مكان هنا من غير ما يدوّر.
 *
 * ## والافتراضي «طالب»
 *
 * لأن ده أغلب اللي بيفتح الصفحة. والتبويب التاني على بعد دوسة، وهي دوسة
 * الأب بياخدها مرة كل أسبوعين — والجلسة بتفضل بعدها.
 */
export function LoginTabs({
  next,
  supportHref,
}: {
  // نفس أنواع `LoginForm` بالحرف — دي بتتمرّر ليه زي ما هي، وتضييقها هنا
  // كان هيخلّي الصفحة تكتب `?? ''` عشان تعدّي، وده بيحوّل «مفيش وجهة»
  // لـ«الوجهة سلسلة فاضية».
  next?: string | null;
  supportHref?: string | null;
}) {
  const [tab, setTab] = useState<'student' | 'guardian'>('student');

  return (
    <>
      <div role="tablist" className="mb-4 flex gap-1 rounded-sm border border-line-subtle p-1">
        {(['student', 'guardian'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'flex-1 rounded-sm px-3 py-2 text-[length:var(--fs-text-sm)] transition-colors',
              tab === value ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {value === 'student' ? c.tabStudent : c.tabGuardian}
          </button>
        ))}
      </div>

      {/* الاتنين مش بيتركّبوا مع بعض: كل فورم بيمسك حالته، والتبديل المفروض
          يرمي اللي اتكتب — اللي كتب كود في تبويب ولي الأمر وبعدين رجع لتبويب
          الطالب مش عايز الكود يستناه هناك. */}
      {tab === 'student' ? (
        <LoginForm next={next} supportHref={supportHref} />
      ) : (
        <GuardianCodeForm />
      )}
    </>
  );
}
