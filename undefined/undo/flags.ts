import { z } from "zod";

/**
 * Flag DECLARATIONS. The database holds only values, so:
 *   - a flag that exists in the table but not here is ignored entirely, and
 *   - a flag declared here but never written reads as `defaultValue`.
 * That asymmetry is what makes deleting a flag safe — you delete the
 * declaration and the row becomes inert rather than becoming an unknown.
 */
export interface FlagDeclaration {
  key: string;
  descriptionAr: string;
  defaultValue: boolean;
}

export const FLAG_DECLARATIONS = [
  {
    key: "catalog.showComingSoon",
    descriptionAr: "إظهار الكورسات اللي لسه مش متاحة",
    defaultValue: false,
  },
  {
    key: "quiz.practiceMode",
    descriptionAr: "تفعيل وضع التدريب في الاختبارات",
    defaultValue: true,
  },
  {
    key: "quiz.showReviewAfterSubmit",
    descriptionAr: "عرض المراجعة بعد تسليم الاختبار",
    defaultValue: true,
  },
  {
    key: "player.trackProgress",
    descriptionAr: "تسجيل تقدم مشاهدة الدروس",
    defaultValue: true,
  },
  {
    key: "onboarding.askParentPhones",
    descriptionAr: "السؤال عن أرقام ولي الأمر",
    defaultValue: true,
  },
  {
    key: "home.showTestimonials",
    descriptionAr: "إظهار آراء الطلبة في الصفحة الرئيسية",
    defaultValue: false,
  },
  {
    key: "sessions.enforceDeviceLimit",
    descriptionAr: "تطبيق حد الأجهزة المسموح بها",
    defaultValue: false,
  },
] as const satisfies readonly FlagDeclaration[];

export type FlagKey = (typeof FLAG_DECLARATIONS)[number]["key"];

export const FeatureFlagSchema = z.object({
  key: z.string(),
  descriptionAr: z.string(),
  enabled: z.boolean(),
  updatedAt: z.string(),
});

export const FeatureFlagListSchema = z.array(FeatureFlagSchema);
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type FeatureFlagList = z.infer<typeof FeatureFlagListSchema>;

export const FeatureFlagPatchSchema = z
  .object({ enabled: z.boolean() })
  .strict();

/** Undeclared keys and missing rows both resolve to the declared default. */
export function isEnabled(flags: FeatureFlagList, key: FlagKey): boolean {
  const declaration = FLAG_DECLARATIONS.find((entry) => entry.key === key);
  if (!declaration) return false;
  return (
    flags.find((flag) => flag.key === key)?.enabled ?? declaration.defaultValue
  );
}
