import { z } from "zod";

/**
 * No relative imports here, for the same reason as `auth.ts`/`onboarding.ts`
 * — a leaf module apps/api and apps/web can both reach via the
 * `@ayman/contracts/sessions` subpath export without tripping Node's native
 * ESM loader on the root barrel's extensionless re-exports.
 *
 * Mirrors `apps/api/src/modules/sessions/session-device.service.ts`'s
 * `SessionDeviceView` — the shape `GET /api/sessions` actually returns.
 */
export const SessionDeviceSchema = z.object({
  id: z.string(),
  deviceName: z.string(),
  deviceType: z.string(),
  ip: z.string().nullable(),
  lastSeenAt: z.string(),
  loggedInAt: z.string(),
  isCurrent: z.boolean(),
});

export const SessionDeviceListSchema = z.array(SessionDeviceSchema);

export type SessionDevice = z.infer<typeof SessionDeviceSchema>;
