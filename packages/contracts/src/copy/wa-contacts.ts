import type { WaContactsPauseCode } from '@ayman/contracts/marketing/wa-contacts';

/**
 * «احفظهم في واتساب» — the students page's panel that saves every student as
 * a contact in the linked number's WhatsApp (not the phone), so the Status
 * reaches them.
 *
 * Egyptian Arabic. Admin-facing only, and still never assumes the student is
 * a boy or a girl (CLAUDE.md §7). No instructor name: the table is shared by
 * every stack and the tenant-identity guard walks it.
 */
export const waContactsCopy = {
  button: 'احفظهم في واتساب',
  title: 'حفظ الطلبة في واتساب',
  lead: 'كل طالب بيتحفظ جهة اتصال في واتساب الرقم المربوط بالمنصة بس، مش في جهات اتصال التليفون، باسمه اللي على المنصة. كده الاستوري توصل لكل طالب حافظ الرقم. محدش بتوصله رسالة ولا إشعار.',
  phoneSetting:
    'قبل أول مرة: على التليفون افتح واتساب ← الإعدادات ← الخصوصية ← جهات الاتصال، وخلّي «جهات اتصال واتساب» شغّالة. من غيرها ممكن الأسامي تنزل في جهات اتصال التليفون.',
  pace: 'بيمشي على مهله عشان الرقم يفضل في أمان: واحد كل دقيقة تقريبًا، وراحة كل {batch}، ولحد {cap} في اليوم، من {from} الصبح لحد {to} بالليل.',

  loading: 'بنشوف الحالة…',
  loadFailed: 'مقدرناش نجيب الحالة. جرّب تاني.',
  deviceOffline: 'الرقم مش مربوط دلوقتي. اربطه من «التسويق ← الجهاز» الأول.',

  stateIdle: 'لسه ماابتدناش',
  stateRunning: 'شغّال',
  statePaused: 'واقف',
  stateDone: 'خلصوا كلهم',

  statSaved: 'اتحفظوا',
  statPending: 'مستنيين',
  statNotOnWhatsapp: 'مالهمش واتساب',
  statFailed: 'ماتحفظوش',
  statStudents: 'طلبة ليهم رقم',
  savedToday: 'النهارده: {n} من {cap}',
  nextAt: 'اللي بعده: {at}',
  lastSavedAt: 'آخر واحد اتحفظ: {at}',
  estimate: 'الباقي حوالي {time}',
  minutes: '{n} دقيقة',
  hours: '{n} ساعة',
  days: '{n} يوم',

  trial: 'جرّب على {n} بس الأول',
  trialHint: 'ابدأ بـ{n} طلبة، وبعدين نزّل استوري واتأكد إنهم شافوها من «مين شاف» قبل ما تكمّل على الباقي.',
  startAll: 'احفظهم كلهم',
  startAllConfirm: 'هيتحفظ {n} طالب على مهله على كام يوم. لو واتساب اعترض على أي حاجة بيقف لوحده. نبدأ؟',
  resume: 'كمّل',
  pause: 'وقّف',
  started: 'ابتدينا. هيكمّل لوحده حتى لو قفلت الصفحة.',
  paused: 'وقف',
  actionFailed: 'العملية ماتمّتش. جرّب تاني.',

  pauseReason: {
    manual: 'وقّفته بنفسك.',
    limit: 'خلص التجربة. نزّل استوري واتأكد إنها وصلت للطلبة دول، وبعدين كمّل.',
    device: 'وقف لأن الرقم اتفصل. اربطه تاني وبعدين كمّل.',
    restricted: 'وقف لأن واتساب مقيّد الرقم ده مؤقتًا. استنى لحد ما القيد يخلص قبل ما تكمّل.',
    error: 'وقف لأن واتساب أو الجهاز رد بخطأ. شوف التفاصيل تحت، وكمّل لما تتأكد إن كله تمام.',
  } satisfies Record<WaContactsPauseCode, string>,
} as const;
