'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { STUDENT_TABS, activeStudentNav } from './student-nav-items';

/**
 * الشريط السفلي — أربع وجهات على بعد لمسة واحدة، على الموبايل بس.
 *
 * ## المشكلة اللي ده جوابها
 *
 * «أهم شي الموبايل لأن معظم الناس موبايل». وعلى الموبايل مكان **كل** حاجة كان
 * الهامبرجر: الطالب اللي عايز يشوف نتيجته بيدوس «القائمة»، تفتح شيت فيه كارت
 * الحساب وسبع لينكات وليستة كورساته والتيم توجل وتسجيل الخروج، يدوّر، يلاقي
 * «نتائجي»، يدوس. تلات لمسات وقراية على شاشة ٣٦٠ بكسل — وده على أكتر أربع
 * صفحات بيفتحهم.
 *
 * الشريط ده بيخلّيهم لمسة واحدة، والقائمة بتفضل مكان الباقي كله. مفيش حاجة
 * اتشالت من الشيت؛ اللي اتغيّر إن مبقى المدخل الوحيد.
 *
 * ## أربعة، والرقم ده قيد مش مزاج
 *
 * شاشة ٣٦٠ بكسل على خمسة = ٧٢ بكسل للتاب، وده أقل من هدف لمس ٤٤ + كلمة عربي
 * مقرويّة جنبه. `STUDENT_TABS` بيشرح مين الأربعة وليه.
 *
 * ## ليه لينكات مش زراير
 *
 * دي تنقّل. `<Link>` بيدي الطالب الضغط الطويل، والفتح في تاب تاني، والزرار
 * الخلفي — وبيخلّي `aria-current="page"` هو اللي بيقول للسكرين ريدر هو فين، بدل
 * ستايل بيتقرا بالعين وبس.
 *
 * ## والأيقونة والكلمة مع بعض
 *
 * أيقونة لوحدها بتسأل الطالب يتعلّم رمز، والجمهور ده معلّمنا بالنص إنه
 * مايتعلّمش الرموز: «العلامة اللي فوق على اليمين دي… أعلّم عليها بشكل كويس».
 * نفس السطر اللي خلّى الهامبرجر ياخد كلمة «القائمة» جنبه.
 */
export function StudentTabBar() {
  const pathname = usePathname();
  const active = activeStudentNav(pathname);

  return (
    <nav className="tabbar md:hidden" aria-label={copy.nav.mainNav}>
      <ul className="tabbar__list">
        {STUDENT_TABS.map((item) => {
          const isActive = active?.href === item.href;
          return (
            <li key={item.href} className="tabbar__cell">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className="tabbar__tab"
                data-active={isActive ? '' : undefined}
              >
                <item.icon className="size-5" aria-hidden="true" />
                <span className="tabbar__label">{item.labelAr}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
