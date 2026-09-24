import { refresh, revalidatePath as nextRevalidatePath } from 'next/cache';

/**
 * `revalidatePath` للأكشنز بتاعة لوحة الأدمن — ومعاه `refresh()`.
 *
 * ## ليه `revalidatePath` لوحده مكانش بيكفّي
 *
 * الأدمن كان بيضيف اشتراك لطالب، الديالوج يقفل، والصف **مايظهرش** غير بعد
 * ريفرش. على `next dev` كان بيظهر عادي — فمحدش شافها لوكال.
 *
 * اتقاس على بيلد برودكشن لوكال (`next build && next start`)، نفس الفلو
 * بالظبط: من غير `refresh()` الصف بيظهر بعد ريفرش بس؛ معاه بيظهر على طول.
 * وعلى `next dev` الاتنين شغّالين — `revalidate.js` في `next@16.2.11` فيه
 * فرع بيعلّم الطلب `usedDynamic` **في غير البرودكشن بس**، فالتست لوكال على
 * dev مش هيوريك الباج أبدًا.
 *
 * الاتنين بيعلّموا الأكشن إنه «اتعمله revalidate»، بس بنوعين مختلفين:
 * `revalidatePath` بـ`StaticAndDynamic` و`refresh()` بـ`DynamicOnly`. واللي
 * بيرسم الصفحة الديناميك اللي الأدمن واقف عليها فعلًا على البرودكشن هو
 * التاني. `refresh()` مابيلمسش أي كاش، فتكلفته رسم الصفحة الحالية وبس — وده
 * اللي كان مطلوب من الأول.
 *
 * و`revalidatePath` لسه موجود جنبه: هو اللي بيبطّل الصفحات **التانية** اللي
 * الأكشن بيسمّيها (شاشة الفلوس بعد إلغاء من صفحة الطالب مثلًا).
 *
 * ⚠️ `refresh()` بيرمي برا Server Action (مثلًا لو دالة من دول اتنادت من
 * route handler). الـ`try` عشان إعادة الرسم **تحسين** — الكتابة نفسها حصلت
 * خلاص، وإنها توقّع الأكشن بعد ما الداتا اتحفظت كانت هتقول للأدمن «مامشيش»
 * على حاجة مشيت.
 */
export function revalidatePath(path: string, type?: 'layout' | 'page'): void {
  // `type` بيتبعت بس لو موجود — نفس النداء الأصلي بالحرف، عشان أي حد (أو
  // تست) بيراقب `revalidatePath` يشوف نفس الأرجيومنتس اللي كان بيشوفها.
  if (type) nextRevalidatePath(path, type);
  else nextRevalidatePath(path);
  try {
    refresh();
  } catch {
    // مش جوّه Server Action — اقرا الكومنت فوق.
  }
}
