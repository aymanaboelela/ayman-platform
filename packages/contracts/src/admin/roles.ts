import { z } from '@ayman/contracts/zod';

/**
 * Roles whose permissions an operator may open up.
 *
 * `admin` is absent and `student` is absent, for opposite reasons. `admin`
 * already holds `'*'`, so a grant to it would be a row that changes nothing.
 * `student` is not a staff role — widening it would hand every account on the
 * platform whatever was granted, which is never what somebody means when they
 * open a screen called «الصلاحيات».
 */
export const GRANTABLE_ROLES = ['owner'] as const;
export const GrantableRoleSchema = z.enum(GRANTABLE_ROLES);
export type GrantableRole = z.infer<typeof GrantableRoleSchema>;

/** A `resource:action` string. Shape only — the API checks it is grantable. */
const permissionString = z
  .string()
  .regex(/^[a-z][a-z-]*:[a-z][a-z-]*$/, 'must look like resource:action');

/**
 * The whole set a role should hold beyond its baseline, not a delta.
 *
 * Whole-set because that is the shape of the screen — a list of checkboxes and
 * one save — and because a delta would need the caller to know what is already
 * there, which is how two operators quietly undo each other.
 */
export const RoleGrantsWriteSchema = z
  .object({
    permissions: z.array(permissionString).max(200),
  })
  .strict();

export type RoleGrantsWrite = z.infer<typeof RoleGrantsWriteSchema>;

export const RoleGrantsReadSchema = z.object({
  role: GrantableRoleSchema,
  /** What the role holds no matter what — compiled in, not editable. */
  baseline: z.array(z.string()),
  /** What has been opened up on this deployment. */
  granted: z.array(z.string()),
  /** What is still available to open. */
  grantable: z.array(z.string()),
});

export type RoleGrantsRead = z.infer<typeof RoleGrantsReadSchema>;

/**
 * صلاحيات **حساب** بعينه — الشاشة اللي المدرّس بيقفل منها المصروفات على
 * مساعد من غير ما يلمس باقي المساعدين.
 *
 * ## ليه مش نفس شكل `RoleGrantsRead`
 *
 * ده بيتكلم عن حساب مش رول، وفيه حالة تالتة: `withheld`. الرول بيفتح بس
 * (شوف `grantablePermissions`)، والحساب بيفتح **ويقفل** — وده اللي بيخلّي
 * مساعد محدود ممكن أصلًا، لأن أساس `owner` هو «كل حاجة إلا المقالات».
 */
export const UserPermissionsReadSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.string(),
  /** اللي الحساب ماسكه فعلًا دلوقتي — الأساس + المفتوح − المقفول. */
  effective: z.array(z.string()),
  /** اللي الرول بيديهوله من غير أي تدخّل. الشاشة بتوريه كخلفية للقرار. */
  baseline: z.array(z.string()),
  /** قرارات صريحة اتاخدت على الحساب ده. */
  allowed: z.array(z.string()),
  withheld: z.array(z.string()),
});
export type UserPermissionsRead = z.infer<typeof UserPermissionsReadSchema>;

/**
 * الكتابة: الشاشة بتبعت اللي المفروض الحساب يملكه **بالكامل**، والسيرفر
 * بيحسب الفرق عن الأساس ويكتب صفوف الفتح والقفل.
 *
 * ⚠️ بتبعت الحالة النهائية مش «افتح دي» / «اقفل دي»، وده مقصود: الشاشة فيها
 * تمن أقسام وعشرات الشيك بوكسات، والفرق التراكمي بينهم وبين الداتابيز أسهل
 * حاجة يغلط فيها. الحالة النهائية بتخلّي إعادة الإرسال بنفس القيم لا تعمل
 * حاجة.
 */
export const UserPermissionsWriteSchema = z
  .object({ permissions: z.array(z.string()).max(500) })
  .strict();
export type UserPermissionsWrite = z.infer<typeof UserPermissionsWriteSchema>;
