import type { ReactNode } from 'react';
import { SpotIllustration, type SpotName } from '@/components/dashboard/spot-illustration';

/**
 * الحالة الفاضية في لوحة التحكم — رسمة وعنوان وسطر، وزرار لو فيه حاجة تتعمل.
 *
 * ## اللي كان موجود
 *
 * ٥٣ صندوق `border-dashed` مكتوبين بالإيد في صفحات اللوحة، كل واحد فيهم
 * سطرين رماديين في علبة متقطّعة. على الثيم الغامق دي بتقرا كصفحة **ما
 * حمّلتش** مش كمكان مستنّي يتملى — ودي نفس الجملة بالحرف اللي
 * `spot-illustration.tsx` اتكتب عشانها على شاشة الطالب.
 *
 * ## نفس الرسمة، مش رسمة تانية
 *
 * `(admin)/layout.tsx` بيستورد `study.css` أصلًا، فكلاسات `.spot` شغّالة
 * هناك من غير ما يتنقل ملف. يعني اللوحة والطالب بيرسموا بنفس القلم وبنفس
 * التوكنز، وبيتقلبوا مع الثيم مع بعض.
 *
 * ## وليه SVG مش صورة منزّلة
 *
 * تلات أسباب، والتالت هو الحاسم:
 *
 * 1. بتتلوّن من `--e-*` و`--a-*`، فبتشتغل غامق وفاتح — صورة PNG كانت هتفضل
 *    بخلفية بيضا في نص لوحة سودا.
 * 2. حادّة على أي مقاس ومابتكلّفش ريكويست.
 * 3. **وملهاش صاحب.** المنصة دي بتاخد فلوس من طلبة، وصورة متنزّلة من جوجل
 *    عليها حق ملكية حد تاني — والحساب بييجي للي نشرها مش للي رسمها.
 *
 * ## `action`
 *
 * اختياري، ومقصود إنه كده: شاشة زي «المدفوعات» الفاضية مفيهاش حاجة المدرّس
 * يعملها — الطلبة هُمّ اللي بيبعتوا. زرار هناك بيوعد بحاجة مش موجودة.
 * وشاشة زي «الكورسات» الفاضية فيها «كورس جديد»، وده الفرق.
 */
export function AdminEmpty({
  spot,
  title,
  hint,
  action,
}: {
  spot: SpotName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty">
      <SpotIllustration name={spot} />
      <p className="admin-empty__title">{title}</p>
      {hint ? <p className="admin-empty__hint">{hint}</p> : null}
      {action ? <div className="admin-empty__action">{action}</div> : null}
    </div>
  );
}
