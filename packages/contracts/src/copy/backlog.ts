/**
 * «المتراكم» — كل كلمة على الشاشة، في مكان واحد.
 *
 * موديول لوحده، مش مفاتيح جديدة في `copy/ar.ts` — نفس سبب `copy/mistakes.ts`:
 * تاب فاضل مفتوح من بيلد قبل كده ماعندوش module id للمسار ده
 * (`turbopack-module-ids-outlive-a-deploy`). المفتاح الوحيد في `ar.ts` هو
 * اسم البند في القايمة (`nav.backlog`).
 *
 * ⚠️ مفيش خطاب مذكّر هنا — الزراير أسماء («مشاهدة»، «الامتحان») مش أوامر
 * («شوف»، «امتحن»)، والحالات مبني للمجهول («متشافتش»، «متسلّمش»).
 */
export const backlogCopy = {
  meta: { title: 'المتراكم' },
  page: {
    eyebrow: 'متابعة',
    title: 'المتراكم عليك',
    lead: 'كل محاضرة وكويز وواجب مفتوح ولسه مخلصش — متقسّمين بالكورس، وجنب كل سطر زرار يودّي عليه على طول.',
  },
  hero: {
    pill: 'اللي عليك دلوقتي',
    /** The word under the big number — the number itself is drawn apart,
     *  so no `{count}` here; the form still follows it (`arabicCount`). */
    total: { one: 'حاجة متراكمة', two: 'حاجات متراكمة', few: 'حاجات متراكمة', many: 'حاجة متراكمة' },
    clearTitle: 'مفيش حاجة متراكمة',
    clearBody: 'كل اللي نزل اتشاف، وكل كويز اتحل، وكل واجب اتسلّم. أول ما ينزل جديد هيظهر هنا.',
    clearCta: 'مساري',
    /** واجب اتسلّم ومستني التصحيح — مش متراكم، بس لازم يبان إنه وصل. */
    awaiting: {
      one: 'واجب واحد اتسلّم ومستني التصحيح',
      two: 'واجبين اتسلّموا ومستنيين التصحيح',
      few: '{count} واجبات اتسلّمت ومستنية التصحيح',
      many: '{count} واجب اتسلّم ومستني التصحيح',
    },
  },
  /** الكروت التلاتة — وهي نفسها فلتر القايمة. */
  stats: {
    all: 'الكل',
    lectures: 'محاضرات',
    quizzes: 'كويزات',
    homework: 'واجبات',
    filterLabel: 'فلترة المتراكم',
  },
  course: {
    count: { one: 'حاجة واحدة', two: 'حاجتين', few: '{count} حاجات', many: '{count} حاجة' },
    open: 'صفحة الكورس',
  },
  kind: {
    lecture: 'محاضرة',
    quiz: 'كويز',
    exam: 'الامتحان النهائي',
    homework: 'واجب',
  },
  status: {
    lectureNew: 'متشافتش',
    lectureStarted: 'متكمّلتش',
    quizNew: 'متحلّش',
    quizStarted: 'مفتوح ومتسلّمش',
    examOpen: 'مفتوح دلوقتي',
    homeworkNew: 'متسلّمش',
    homeworkRedo: 'محتاج تعديل',
  },
  action: {
    watch: 'مشاهدة',
    resume: 'استكمال',
    quiz: 'الكويز',
    exam: 'الامتحان',
    homework: 'تسليم الواجب',
    homeworkRedo: 'تعديل الواجب',
  },
  filteredEmpty: 'مفيش حاجة متراكمة من النوع ده.',
} as const;
