/**
 * «ستوديو التصميم» — the designer's workspace, the instructor's view of it,
 * and the «من التصميمات» picker on every cover field.
 *
 * Staff copy (the designer and the instructor), Egyptian Arabic. Latin format
 * names (PNG, JPG) never sit mid-sentence here — they are rendered as their
 * own isolated chips, because a Latin run inside an Arabic line flips it.
 *
 * No instructor name anywhere: the section is gated to one stack, but the copy
 * table is shared and the tenant-identity guard walks it.
 */
export const designsCopy = {
  nav: 'التصميمات',
  title: 'ستوديو التصميم',
  studioLead: 'التصميمات بتترفع هنا بجودتها الكاملة، متقسمة في فولدرات.',
  adminLead:
    'الصور اللي المصمم بيرفعها، بجودتها الأصلية. تقدر تنزّل أي صورة، أو تخليها غلاف محاضرة من خانة الغلاف في المحاضرة نفسها.',
  signOut: 'خروج',

  folders: 'الفولدرات',
  newFolder: 'فولدر جديد',
  folderName: 'اسم الفولدر',
  folderNamePlaceholder: 'مثلًا: غلافات الترم الأول',
  create: 'إنشاء',
  creating: 'بيتعمل…',
  cancel: 'إلغاء',
  save: 'حفظ',
  saving: 'بيتحفظ…',
  rename: 'تغيير الاسم',
  color: 'اللون',
  colors: {
    amber: 'برتقالي',
    teal: 'تركواز',
    violet: 'بنفسجي',
    rose: 'وردي',
    blue: 'أزرق',
    green: 'أخضر',
  },
  folderSettings: 'إعدادات الفولدر',
  deleteFolder: 'مسح الفولدر',
  deleteFolderTitle: 'مسح الفولدر «{name}»؟',
  deleteFolderBody: 'هيتمسح الفولدر و{count} صورة جواه نهائيًا. الأغلفة اللي اتحطت على محاضرات قبل كده مش هتتأثر.',
  deleteFolderEmpty: 'الفولدر فاضي، ومسحه مش هيأثر على حاجة.',
  noFolders: 'لسه مفيش فولدرات.',
  noFoldersHint: 'أول خطوة: فولدر جديد، وبعدها الصور جواه.',
  pickFolder: 'اختار فولدر من الليستة.',

  assetsCount: '{count} صورة',
  upload: 'رفع صور',
  dropHere: 'سيب الصور هنا',
  dropHint: 'اسحب الصور وسيبها هنا، أو من زرار «رفع صور»',
  formats: 'الصيغ المقبولة',
  maxSize: 'لحد {size} للصورة · بنفس المقاس والجودة',
  emptyFolder: 'الفولدر ده لسه فاضي.',
  search: 'دوّر باسم الصورة',
  noMatches: 'مفيش صورة بالاسم ده.',

  queueTitle: 'الرفع',
  queued: 'مستنية',
  uploading: 'بتترفع',
  processing: 'بتتجهز',
  done: 'اترفعت',
  retrying: 'السيرفر مشغول، هنحاول تاني…',
  clearDone: 'إخفاء اللي خلص',
  uploadFailed: {
    tooLarge: 'أكبر من ٦٠ ميجا',
    badType: 'مش صيغة صورة مسموحة',
    unreadable: 'الملف بايظ أو مش صورة',
    full: 'مساحة الاستوديو خلصت',
    network: 'النت فصل',
    failed: 'مقدرناش نرفعها',
  },

  view: 'عرض',
  download: 'تنزيل',
  replace: 'استبدال',
  move: 'نقل لفولدر تاني',
  delete: 'مسح',
  more: 'اختيارات تانية',
  deleteTitle: 'مسح «{name}»؟',
  deleteBody: 'الصورة هتتمسح نهائيًا من الاستوديو. لو اتحطت غلاف محاضرة قبل كده، الغلاف هيفضل زي ما هو.',
  confirmDelete: 'أيوه، امسح',
  close: 'قفل',
  byline: 'رفعها {name}',
  updated: 'اتعدلت {date}',

  saved: 'اتحفظ',
  deleted: 'اتمسحت',
  replaced: 'اتبدلت — النسخة الجديدة هي اللي بتتنزل دلوقتي',
  moved: 'اتنقلت',
  actionFailed: 'مقدرناش نكمّل، جرّب تاني',

  storage: 'مساحة الاستوديو',
  storageOf: '{used} من {quota}',
  storageFull: 'المساحة قربت تخلص',

  /** The «من التصميمات» picker beside every cover upload. */
  picker: {
    open: 'من التصميمات',
    title: 'اختار تصميم',
    lead: 'بنجهز نسخة بأعلى جودة مقاسها مظبوط على الخانة دي. الأصل بيفضل في الاستوديو.',
    empty: 'لسه مفيش تصميمات مرفوعة.',
    back: 'كل الفولدرات',
    use: 'استخدمها',
    publishing: 'بنجهزها…',
    published: 'اتحطت بأعلى جودة',
    failed: 'مقدرناش نجهز الصورة دي',
    loadFailed: 'مقدرناش نجيب التصميمات',
  },

  /** «الفريق» — appointing a designer. */
  team: {
    addAs: 'يتضاف كـ',
    roleOwner: 'مساعد',
    roleOwnerHint: 'بيدخل لوحة التحكم بالصلاحيات اللي تحددها',
    roleDesigner: 'مصمم جرافيك',
    roleDesignerHint: 'ستوديو التصميم بس — مالوش دخول على لوحة التحكم ولا على بيانات الطلبة',
    designerNoPermissions: 'الاستوديو بس',
  },
} as const;
