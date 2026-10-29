/**
 * «البانرات الترويجية» — the admin screen that manages them, and the strip
 * on the student's dashboard that shows them.
 *
 * Egyptian Arabic. The student lines never address the reader as a boy or a
 * girl (CLAUDE.md §7), and no instructor name appears anywhere: the copy
 * table is shared by every stack and the tenant-identity guard walks it.
 */
export const promoBannersCopy = {
  admin: {
    nav: 'البانرات الترويجية',
    title: 'البانرات الترويجية',
    lead: 'صور بتظهر فوق لوحة الطالب: عرض، كورس جديد، كتاب نزل. كل بانر ليه مدة، ولينك لو عايز، وسنة دراسية لو هو لسنة بعينها.',
    add: 'ضيف بانر',
    addTitle: 'بانر جديد',
    editTitle: 'تعديل البانر',
    edit: 'تعديل',
    remove: 'مسح',
    removeConfirm: 'البانر ده هيتمسح خالص ومش هيرجع. نكمّل؟',
    removed: 'البانر اتمسح',
    saved: 'اتحفظ',
    saveFailed: 'الحفظ ماتمّش. جرّب تاني.',
    save: 'حفظ',
    cancel: 'إلغاء',

    statTotal: 'الإجمالي',
    statLive: 'شغّالة دلوقتي',
    statWithLink: 'بلينك',
    limitReached: 'وصلت لأقصى عدد ({max} بانر). امسح واحد قديم الأول.',

    empty: 'لسه مفيش بانرات.',
    emptyHint: 'أول بانر تضيفه هيظهر للطلبة فوق لوحتهم على طول.',

    imageLabel: 'صورة البانر',
    imageHint: 'عريضة (٣ لـ ١) — مثلًا ١٥٠٠×٥٠٠',
    imageMissing: 'ارفع صورة البانر الأول',
    titleLabel: 'عنوان (اختياري)',
    titleHint: 'بيتكتب على الصورة من تحت. سيبه فاضي لو الصورة فيها الكلام.',
    linkLabel: 'لينك (اختياري)',
    linkHint: 'صفحة على المنصة زي /library، أو لينك برّه بيبدأ بـ https://',
    linkInvalid: 'اللينك لازم يبدأ بـ / أو https://',
    yearsLabel: 'لمين؟',
    yearsHint: 'من غير اختيار = كل الطلبة.',
    yearsAll: 'كل الطلبة',
    /** Only when the taxonomy read failed — the screen prints the stack's own
     *  year names («الصف الأول بكالوريا») whenever it has them. */
    yearFallback: ['السنة الأولى', 'السنة التانية', 'السنة التالتة'],
    startsOnLabel: 'يبدأ من',
    endsOnLabel: 'لحد',
    windowHint: 'سيبهم فاضيين لو البانر مالوش مدة. اليومين داخلين.',
    windowInvalid: 'تاريخ النهاية قبل تاريخ البداية',
    activeLabel: 'شغّال',
    activeHint: 'اقفله لو عايز توقّفه من غير ما تمسحه.',

    statusLive: 'شغّال دلوقتي',
    statusOff: 'متوقّف',
    statusScheduled: 'هيبدأ {date}',
    statusEnded: 'خلص {date}',
    noTitle: 'من غير عنوان',
    noLink: 'من غير لينك',
    windowAlways: 'من غير مدة',
    windowFrom: 'من {date}',
    windowUntil: 'لحد {date}',
    windowRange: '{from} ← {to}',
    turnOn: 'شغّله',
    turnOff: 'وقّفه',
    reorderHint: 'اسحب البانر عشان تغيّر ترتيبه. الأول هو اللي بيظهر الأول.',
    preview: 'شكله عند الطالب',
  },

  student: {
    /** The region's accessible name — a landmark a screen reader can jump to. */
    region: 'عروض وأخبار',
    previous: 'البانر اللي قبله',
    next: 'البانر اللي بعده',
    goTo: 'روح للبانر {n}',
    /** «٢ من ٤» — read by a screen reader as each slide comes into view. */
    position: '{n} من {total}',
    opensOutside: '(بيفتح في صفحة جديدة)',
  },
} as const;
