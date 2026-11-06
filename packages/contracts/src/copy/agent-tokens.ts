/**
 * «ربط Claude» — the admin screen that makes and revokes the keys an AI
 * assistant uses to call the admin API (`admin/agent-tokens.ts`).
 *
 * Egyptian Arabic, admin-facing. No instructor name anywhere: the copy table
 * is shared by every stack and the tenant-identity guard walks it.
 */
export const agentTokensCopy = {
  nav: 'ربط Claude',
  title: 'ربط Claude بالمنصة',
  lead: 'اعمل مفتاح بالصلاحيات اللي تختارها بس، وClaude يستخدمه يصحح ويشتغل من غير ما يدخل من المتصفح. المفتاح بيتصرف باسمك، ومايقدرش يعمل أكتر من اللي معاك ولا من اللي علّمت عليه. وتقدر تلغيه في أي وقت.',

  createTitle: 'مفتاح جديد',
  nameLabel: 'اسم المفتاح',
  namePlaceholder: 'مثلاً: Claude على اللابتوب',
  lifetimeLabel: 'صالح لمدة',
  lifetime: { 7: 'أسبوع', 30: 'شهر', 90: '٣ شهور', 365: 'سنة' } as Record<number, string>,
  permissionsTitle: 'يقدر يعمل إيه',
  permissionsLead: 'علّم على الأقسام اللي محتاجها بس. افتح القسم لو عاوز تختار صلاحية صلاحية.',
  presetTitle: 'اختيار سريع',
  presetGrading: 'التصحيح بس',
  presetTeaching: 'كل حاجة إلا الفلوس',
  presetAll: 'كل اللي أقدر أديه',
  presetHint: 'الاختيار السريع بيعلّم بس، راجع قبل ما تعمل المفتاح.',
  open: 'التفاصيل',
  close: 'اقفل',
  countAll: 'كله',
  countNone: 'ولا حاجة',
  count: '{on} من {all}',
  create: 'اعمل المفتاح',
  creating: 'بيتعمل…',
  needName: 'اكتب اسم للمفتاح.',
  needPermission: 'علّم على صلاحية واحدة على الأقل.',
  createFailed: 'مقدرناش نعمل المفتاح. جرّب تاني.',
  tooMany: 'عندك مفاتيح شغالة كتير. الغي واحد الأول.',

  revealTitle: 'انسخ المفتاح دلوقتي',
  revealLead: 'المفتاح ده مش هيظهر تاني. انسخه وحطه في Claude، ولو ضاع اعمل واحد جديد.',
  copy: 'انسخ',
  copied: 'اتنسخ',
  setupTitle: 'تركيبه على الماك',
  setupLead: 'افتح Terminal واكتب السطر ده، ولما يطلب منك الكلمة الصق المفتاح. هيتحفظ في Keychain مش في ملف.',
  done: 'تمام، نسخته',

  listTitle: 'المفاتيح',
  listEmpty: 'مفيش مفاتيح لسه.',
  colName: 'المفتاح',
  colPermissions: 'الصلاحيات',
  colCreated: 'اتعمل',
  colLastUsed: 'آخر استخدام',
  colExpires: 'بيخلص',
  neverUsed: 'لسه ما اتستخدمش',
  permissionsCount: '{n} صلاحية',
  createdBy: 'عمله {name}',
  statusActive: 'شغال',
  statusExpired: 'خلص',
  statusRevoked: 'اتلغى',
  revoke: 'الغي',
  revokeConfirm: 'تلغي المفتاح «{name}»؟ أي حاجة بتستخدمه هتقف فورًا.',
  revoked: 'المفتاح اتلغى.',
  revokeFailed: 'مقدرناش نلغي المفتاح.',
  loadFailed: 'مقدرناش نجيب المفاتيح.',
} as const;
