'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Entitlements, FeatureKey } from '@ayman/contracts/admin/entitlements';

/**
 * إيه اللي الستاك ده مسموح له يعرضه، لكومبوننتات اللوحة الـ`'use client'`.
 *
 * ## ليه كونتكست ومش prop
 *
 * السايدبار والهيدر ولادين مباشرين لليياوت، فالـprop عندهم أنضف حاجة. إنما
 * تاب الرفع في `lesson-panel.tsx` قاعد على عمق خمس كومبوننتات من
 * `course-editor.tsx` — كلهم `'use client'` — ونفس الحكاية في مؤلّف الصفحة
 * الرئيسية وفي شاشة التصحيح. تمرير نفس القيمة يدوي في الخمسة دول معناه إن
 * أي كومبوننت جديد بينسى يستلمها **بيرسم الفيتشر**، وهو أسوأ اتجاه للنسيان.
 *
 * ## ⚠️ وليه مش قراءة من `process.env` هنا
 *
 * ده كود بيتنفّذ في المتصفح. `process.env.TENANT_ENTITLEMENTS` بيبقى
 * `undefined` هناك إلا لو اتحقن في `next.config.ts` — وساعتها يبقى قيمة وقت
 * بناء، والسيرفر والكلاينت يختلفوا لو اتغيّرت. القيمة بتتحسب مرة في
 * `(admin)/layout.tsx` وبتنزل من هنا، فالاتنين بيقروا نفس الرقم.
 *
 * ## وده كله إخفاء، مش قفل
 *
 * القفل `@RequireFeature` على الكونترولر في الـAPI. الكونتكست ده بيمنع إن
 * المدرّس يشوف زرار بيرد ٤٠٤.
 */
const EntitlementsContext = createContext<Entitlements | null>(null);

export function AdminEntitlementsProvider({
  features,
  children,
}: {
  features: Entitlements;
  children: ReactNode;
}) {
  return <EntitlementsContext.Provider value={features}>{children}</EntitlementsContext.Provider>;
}

/**
 * هل الفيتشر دي مفتوحة؟
 *
 * بيرمي لو مفيش provider بدل ما يرجّع `true`: كومبوننت لوحة برّه
 * `(admin)/layout.tsx` حاجة مالهاش معنى، و«افتراضي مفتوح» هنا كان هيبقى
 * بالظبط الجيت الميت اللي بيعدّي في التستات وبيرسم الفيتشر في الحقيقة.
 */
export function useFeature(key: FeatureKey): boolean {
  const features = useContext(EntitlementsContext);
  if (features === null) {
    throw new Error('useFeature() outside <AdminEntitlementsProvider>');
  }
  return features[key];
}
