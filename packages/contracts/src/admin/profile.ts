import { z } from '@ayman/contracts/zod';

export const AdminProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  role: z.string(),
  image: z.string().nullable(),
  createdAt: z.string(),
  activeSessionsCount: z.number().int().min(0),
  permissions: z.array(z.string()),
});
export type AdminProfile = z.infer<typeof AdminProfileSchema>;

export const AdminUpdateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'الاسم يجب أن يتكون من حرفين على الأقل')
    .max(100, 'الاسم طويل جدًا')
    .optional(),
  phoneNumber: z.string().trim().nullable().optional(),
});
export type AdminUpdateProfileInput = z.infer<typeof AdminUpdateProfileSchema>;

export const AdminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
  newPassword: z
    .string()
    .min(8, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
    .max(128, 'كلمة المرور طويلة جدًا'),
  revokeOtherSessions: z.boolean().default(true),
});
export type AdminChangePasswordInput = z.infer<typeof AdminChangePasswordSchema>;

export const AdminChangePasswordResultSchema = z.object({
  status: z.literal(true),
  message: z.string(),
});
export type AdminChangePasswordResult = z.infer<typeof AdminChangePasswordResultSchema>;
