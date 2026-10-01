/**
 * الصلاحيات مقسّمة أقسام، بالعربي — الشكل اللي شاشة «الصلاحيات» بترسم بيه.
 *
 * ## ليه ده موجود
 *
 * الكتالوج ٨٣ صلاحية بأسماء زي `book-order:ship`. الشاشة كانت بتفرد الـ٨٣
 * كحيطة شيبس واحدة، وده مش «قايمة طويلة» — ده شاشة مالهاش قرار: مفيش حد يقدر
 * يقرا منها إن فلان بيشوف الفلوس ولا لأ.
 *
 * الأقسام هنا هي اللي بتحوّلها لسؤال يتجاوب: «المساعد ده يشوف الفاينانس؟»
 * وبتتقفل بشيك بوكس واحد على القسم كله.
 *
 * ## في الكونتراكتس، مش في الـAPI
 *
 * الشاشة بترسم منه، والـAPI بيتحقق بيه إن القسم اللي جاي في الطلب حقيقي.
 * نسختين منه كانوا هينجرفوا أول مرة حد يضيف صلاحية.
 *
 * ## ⚠️ والتغطية مفروضة بتست
 *
 * `permission-categories.spec.ts` بيقارن الليستة دي بالكتالوج نفسه. أي صلاحية
 * جديدة تتضاف من غير قسم بتوقّع التست.
 *
 * ومن غير الجارد ده الفشل صامت وخبيث: الصلاحية الجديدة **مابتظهرش على
 * الشاشة**، فمحدش يقدر يقفلها — ومحدش ياخد باله، لأن الشاشة شكلها طبيعي.
 * وده عكس اللي المدرّس طلب الفيتشر دي عشانه بالظبط.
 */

/** مفتاح القسم — بيتخزّن في الحاجات اللي بتشاور على قسم، فمايتغيّرش بمزاج. */
export type PermissionCategoryKey =
  | 'finance'
  | 'courses'
  | 'questions'
  | 'homework'
  | 'students'
  | 'site'
  | 'outreach'
  | 'system';

export interface PermissionCategory {
  key: PermissionCategoryKey;
  /** العنوان على الشاشة. */
  titleAr: string;
  /** سطر تحته بيقول القسم ده بيفتح إيه بالظبط — مش شرح للكلمة، وصف للأثر. */
  hintAr: string;
  permissions: readonly string[];
}

export const PERMISSION_CATEGORIES: readonly PermissionCategory[] = [
  {
    key: 'finance',
    titleAr: 'الفلوس',
    hintAr: 'المدفوعات والتحويلات والمصروفات وطلبات الكتب وفلوس السناتر.',
    permissions: [
      'payment:read',
      'payment:review',
      'expense:read',
      'expense:write',
      'book-order:read',
      'book-order:ship',
      'book-order:create',
      'book-order:write',
      'book:read',
      'book:write',
    ],
  },
  {
    key: 'courses',
    titleAr: 'الكورسات والمحاضرات',
    hintAr: 'إنشاء الكورسات ونشرها، الوحدات والمحاضرات، وأكواد الفتح.',
    permissions: [
      'course:read',
      'course:read-admin',
      'course:create',
      'course:update',
      'course:publish',
      'course:delete',
      'section:write',
      'section:reorder',
      'lesson:write',
      'lesson:reorder',
      'enrollment:read',
      'enrollment:create',
      'progress:read',
      'progress:write',
      'taxonomy:read',
      'taxonomy:write',
      'media:read',
      'media:write',
      'media:delete',
    ],
  },
  {
    key: 'questions',
    titleAr: 'الأسئلة والامتحانات',
    hintAr: 'بنك الأسئلة، الكويزات، امتحانات الشهر، وتصحيح الورق.',
    permissions: [
      'question:read',
      'question:write',
      'quiz:read',
      'quiz:write',
      'quiz:attempt',
      'quiz:grade',
      'attempt:read',
      'attempt:grade',
      'attempt:unlock',
    ],
  },
  {
    key: 'homework',
    titleAr: 'الواجبات',
    hintAr: 'واجبات الطلبة وتصحيحها.',
    permissions: ['homework:read', 'homework:review', 'homework:submit'],
  },
  {
    key: 'students',
    titleAr: 'الطلبة',
    hintAr: 'بيانات الطلبة، المحادثات، لوحة الشرف، والسناتر.',
    permissions: [
      'student:read',
      'student:write',
      'student:ban',
      'student:delete',
      'student:set-password',
      'student:role-change',
      'profile:read',
      'profile:write',
      'conversation:read',
      'conversation:reply',
      'conversation:close',
      'honor:read',
      'honor:write',
      'center:read',
      'center:write',
      'center:attendance',
    ],
  },
  {
    key: 'site',
    titleAr: 'الموقع والمحتوى',
    hintAr: 'الصفحة الرئيسية، القوايم، والأخبار.',
    permissions: [
      'home:read',
      'home:write',
      'nav:read',
      'nav:write',
      'news:read',
      'news:write',
      'news:publish',
    ],
  },
  {
    key: 'outreach',
    titleAr: 'التسويق والتواصل',
    hintAr: 'حملات واتساب، الرسايل، والأجهزة المربوطة.',
    permissions: [
      'marketing:read',
      'marketing:write',
      'marketing:send',
      'marketing:device',
      'outreach:read',
    ],
  },
  {
    key: 'system',
    titleAr: 'النظام',
    hintAr: 'الإعدادات، الصلاحيات، سجل التدقيق، والأعطال.',
    permissions: [
      'admin:access',
      'settings:read',
      'settings:write',
      'flags:read',
      'flags:write',
      'analytics:read',
      'audit:read',
      'diagnostics:read',
      'diagnostics:resolve',
      'role:read',
      'role:grant',
      'staff:manage',
      'staff:set-password',
      'payment:submit',
      'book-order:submit',
    ],
  },
];

/** القسم اللي الصلاحية دي فيه، أو `undefined` — والتست بيمنع التانية. */
export function categoryOf(permission: string): PermissionCategory | undefined {
  return PERMISSION_CATEGORIES.find((category) => category.permissions.includes(permission));
}
