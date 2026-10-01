/**
 * «دفتر غلطاتي» — كل كلمة على الشاشة، في مكان واحد.
 *
 * موديول لوحده، مش مفتاح جديد في `copy/ar.ts` — نفس سبب `copy/arena.ts`:
 * تاب فاضل مفتوح من بيلد قبل كده ماعندوش module id للمسار ده
 * (`turbopack-module-ids-outlive-a-deploy`). المفتاح الوحيد في `ar.ts` هو
 * اسم البند في القايمة (`nav.mistakes`).
 *
 * ⚠️ مفيش خطاب مذكّر هنا — نفس قاعدة `copy/outreach.ts`: جملة اسمية
 * («غلطة في {course}») بدل أمر («جاوب تاني»)، ولاحقة ـك على **اسم** بس.
 */
export const mistakesCopy = {
  meta: { title: 'غلطاتي' },
  page: {
    eyebrow: 'مراجعة',
    title: 'دفتر غلطاتي',
    lead: 'كل سؤال غلطت فيه في أي كويز، مجمّع هنا — وتقدر تعيد الاختبار عليه لحد ما يثبّت.',
    tabOpen: 'غلطاتي',
    tabMastered: 'اللي اتصلحت',
    emptyOpen: 'مفيش غلطات لسه — أي سؤال تغلط فيه في كويز هيتحط هنا لوحده.',
    emptyMastered: 'لسه مفيش سؤال اتصلح.',
    countOpen: '{n} سؤال محتاج مراجعة',
    countMastered: '{n} سؤال اتصلح',
    practice: 'امتحن على غلطاتك',
    practiceMastered: 'اعيد الاختبار على اللي اتصلحت',
    missedOnce: 'غلطة مرة',
    missedTimes: 'غلطة {n} مرات',
    missedAt: 'آخر غلطة {when}',
    streakHint: 'صح {have} من {need} عشان تتصلح',
  },
  practice: {
    of: 'سؤال {n} من {total}',
    exit: 'رجوع للدفتر',
    right: 'صح!',
    wrong: 'غلط',
    mastered: 'اتصلحت! ثبّتها كده',
    streak: 'صح متتالي: {n}',
    next: 'اللي بعده',
    done: 'خلّصت مراجعة النهارده',
    doneMastered: '{n} سؤال اتصلح.',
    doneRemaining: 'باقيلك {n} سؤال في الدفتر.',
    backToNotebook: 'رجوع للدفتر',
  },
  closedTitle: 'الدفتر مقفول دلوقتي',
  closedBody: 'دفتر الغلطات لسه مش متاح على المنصة دي.',
} as const;
