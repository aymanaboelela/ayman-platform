/**
 * «المونتاج» — the video editor's hand-over screen, the instructor's view of
 * it, and «حطه في درس».
 *
 * Staff copy (the editor and the instructor), Egyptian Arabic. No instructor
 * name anywhere: the copy table is shared and the tenant-identity guard walks
 * it.
 */
export const montageCopy = {
  nav: 'المونتاج',
  title: 'المونتاج',
  editorLead: 'ارفع الفيديو بعد ما يخلص مونتاج، بجودته الكاملة. هيوصل على طول للوحة التحكم.',
  adminLead:
    'الفيديوهات اللي المونتير رفعها، بالملف الأصلي زي ما هو. نزّل أي فيديو، أو حطه في درس جديد أو درس موجود وهو يتجهز لوحده.',

  dropTitle: 'اسحب الفيديوهات هنا',
  dropOr: 'أو',
  pick: 'اختار فيديو',
  dropHint: 'لحد {size} للفيديو الواحد. الرفع بيكمّل لو النت قطع.',
  formats: 'MP4 · MOV · MKV · WebM',

  listTitle: 'الفيديوهات',
  empty: 'لسه مفيش فيديوهات.',
  emptyEditor: 'أول فيديو ترفعه هيظهر هنا.',
  total: '{count} فيديو · {size}',
  search: 'دوّر باسم الفيديو',
  noMatch: 'مفيش فيديو بالاسم ده.',

  by: 'رفعه {name}',
  uploadedAt: '{date}',
  onLesson: 'اتحط في: {lesson} — {course}',
  openLesson: 'افتح الدرس',
  note: 'ملاحظة',

  statusUploading: 'بيترفع',
  statusPaused: 'الرفع وقف',
  statusReady: 'جاهز',
  statusUsed: 'اتحط في درس',

  resume: 'كمّل الرفع',
  resumeHint: 'اختار نفس الملف تاني وهيكمّل من مكان ما وقف.',
  resumeWrongFile: 'ده مش نفس الملف — اختار «{name}».',
  cancelUpload: 'إلغاء الرفع',
  remaining: 'فاضل {eta}',

  download: 'نزّل',
  downloading: 'بيجهّز…',
  publish: 'حطه في درس',
  rename: 'تعديل',
  delete: 'مسح',
  more: 'خيارات',
  close: 'إغلاق',
  cancel: 'إلغاء',
  save: 'حفظ',
  saving: 'بيتحفظ…',

  editTitle: 'تعديل الفيديو',
  titleLabel: 'اسم الفيديو',
  titlePlaceholder: 'مثلًا: الوحدة الأولى — الدرس التاني',
  noteLabel: 'ملاحظة للمدرّس',
  notePlaceholder: 'أي حاجة محتاج يعرفها عن الفيديو ده',

  deleteTitle: 'تمسح «{name}»؟',
  deleteBody: 'الملف هيتمسح من السيرفر خالص. أي درس اتحط فيه الفيديو ده هيفضل شغال عادي.',
  deleteConfirm: 'امسح',
  deleting: 'بيتمسح…',

  publishTitle: 'حط «{name}» في درس',
  publishLead: 'الفيديو بيتنسخ للدرس ويتجهز لوحده. الملف الأصلي بيفضل هنا.',
  course: 'الكورس',
  section: 'الوحدة',
  pickCourse: 'اختار كورس',
  pickSection: 'اختار وحدة',
  modeNew: 'درس جديد',
  modeNewHint: 'بيتعمل في آخر الوحدة، مش منشور لحد ما تنشره.',
  modeExisting: 'درس موجود',
  modeExistingHint: 'الفيديو اللي عليه دلوقتي بيروح «محفوظة»، مش بيتمسح.',
  lessonTitle: 'اسم الدرس',
  lesson: 'الدرس',
  pickLesson: 'اختار درس',
  hasVideo: 'عليه فيديو',
  noVideoLessons: 'مفيش دروس فيديو في الوحدة دي.',
  noSections: 'الكورس ده مفيهوش وحدات.',
  encrypt: 'تشفير الفيديو (محدش يقدر ينزّله)',
  publishConfirm: 'حطه',
  publishing: 'بيتنسخ…',
  published: 'اتحط في الدرس — بيتجهز دلوقتي',
  goToCourse: 'افتح الكورس',
  loadingTargets: 'بيجيب الكورسات…',

  uploaded: 'اترفع «{name}»',
  uploadFailed: 'الرفع وقف — دوس «كمّل الرفع» واختار نفس الملف',
  tooLarge: '«{name}» أكبر من {size}',
  badType: '«{name}» مش فيديو',
  saved: 'اتحفظ',
  deleted: 'اتمسح',
  failed: 'حصلت مشكلة، جرّب تاني',
  storageOff: 'تخزين الفيديو مش متظبط على السيرفر ده.',

  team: {
    roleEditor: 'مونتير',
    roleEditorHint: 'يرفع الفيديوهات بعد المونتاج وبس — من غير لوحة التحكم.',
    editorNoPermissions: 'المونتاج وبس',
  },
} as const;
