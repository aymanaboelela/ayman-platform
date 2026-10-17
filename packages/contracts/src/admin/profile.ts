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

/**
 * The words for every refusal below live in `copy/admin-account.ts` and are
 * picked by the screen, which validates against THESE schemas before it sends
 * anything — so the bounds have one home and the messages have another. The
 * Modern Standard Arabic messages that used to sit inline here reached the
 * admin verbatim through the server action.
 */
export const AdminUpdateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phoneNumber: z.string().trim().nullable().optional(),
});
export type AdminUpdateProfileInput = z.infer<typeof AdminUpdateProfileSchema>;

/**
 * «تغيير كلمة السر».
 *
 * Bounds are Better Auth's own `minPasswordLength` / `maxPasswordLength`
 * defaults (8 / 128, unset in `auth.config.ts`) — the pair
 * `AdminStudentSetPasswordSchema` copies — so any password this accepts is one
 * the sign-in form takes back.
 *
 * ⚠️ `revokeOtherSessions` defaults to FALSE. It defaulted to true and the
 * form's checkbox started ticked, so changing a password silently signed the
 * admin out of every other device he had, his phone included, from a form
 * that never said it would. Leaving them is now something he asks for, and
 * the CURRENT session is never touched either way
 * (`AdminProfileService.changePassword`).
 */
export const AdminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  revokeOtherSessions: z.boolean().default(false),
});
export type AdminChangePasswordInput = z.infer<typeof AdminChangePasswordSchema>;

/**
 * Why a change was refused, as a CODE in the 400's body — the screen owns the
 * sentence. Read by the API (which throws them) and the server action (which
 * maps them); nothing in the browser imports it.
 */
export const ADMIN_PASSWORD_ERROR_CODES = [
  'current_password_incorrect',
  'password_unchanged',
  'no_credential_account',
] as const;
export type AdminPasswordErrorCode = (typeof ADMIN_PASSWORD_ERROR_CODES)[number];

/**
 * `message` stays OPTIONAL rather than going: during a rolling deploy the web
 * container and the API container are briefly different builds, and a web
 * that still requires it would report a password that DID change as a
 * failure. `revokedSessions` is `.catch(0)` for the mirror-image window.
 */
export const AdminChangePasswordResultSchema = z.object({
  status: z.literal(true),
  message: z.string().optional(),
  /** How many OTHER sessions were signed out — 0 unless he asked. */
  revokedSessions: z.number().int().min(0).catch(0),
});
export type AdminChangePasswordResult = z.infer<typeof AdminChangePasswordResultSchema>;
