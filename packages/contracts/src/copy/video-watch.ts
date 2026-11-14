/**
 * «متابعة التنزيل» — the admin screen of accounts that opened many lectures
 * in one day (`/admin/video-watch`).
 *
 * Egyptian Arabic, admin-facing. Never a gendered verb for the student — the
 * rows talk about the ACCOUNT («الحساب ده فتح») — and no instructor name: the
 * copy table is shared by every stack and the tenant-identity guard walks it.
 */
export const videoWatchCopy = {
  nav: 'متابعة التنزيل',
  title: 'متابعة تنزيل المحاضرات',
  eyebrow: 'حماية الفيديوهات',
  lead: 'الحسابات اللي فتحت {n} محاضرة مختلفة أو أكتر في يوم واحد. ده شكل حد بينزّل الكورس، بس ممكن يكون طالب بيراجع قبل امتحان — افتح ملفه وقرّر.',

  tiles: {
    today: 'حسابات النهارده',
    week: 'آخر ٧ أيام',
    repeat: 'اتكرروا أكتر من يوم',
  },

  listTitle: 'الحسابات',
  listLead: 'الأحدث الأول',
  empty: 'مفيش ولا حساب لحد دلوقتي. أول ما حساب يفتح {n} محاضرة في يوم هيظهر هنا ويجيلك إشعار.',

  videos: '{n} محاضرة',
  /** Arabic has a dual: «يومين», never «٢ أيام». */
  repeatBadgeTwo: 'اتكرر يومين',
  repeatBadge: 'اتكرر {n} أيام',
  firstBadge: 'أول مرة',
  noPhone: 'من غير رقم',
  lastSeen: 'آخر محاضرة {time}',
  lecturesToggle: 'المحاضرات اللي اتفتحت',
  lectureGone: 'فيديوهات اتشالت من الدروس',

  profile: 'ملف الطالب',
  whatsapp: 'واتساب',
} as const;
