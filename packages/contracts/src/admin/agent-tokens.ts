import { z } from '@ayman/contracts/zod';
import { PERMISSION_CATEGORIES } from '@ayman/contracts/admin/permission-categories';

/**
 * «ربط Claude» — a key an AI assistant uses to call the admin API.
 *
 * ## Why a key, and not the browser session it used before
 *
 * Marking was done by driving the instructor's own logged-in Chrome tab and
 * calling `fetch('/api/admin/...')` from inside it. That works, and it hands
 * the assistant EVERYTHING the session can do: money, roles, deleting
 * students — for a job that needs two permissions. A key is the same API
 * with a smaller door: it carries the permissions ticked when it was made,
 * expires, and is revoked from one screen.
 *
 * ## What a key can do — the intersection, never the union
 *
 * A request made with a key is made AS the account that created it, with the
 * permissions that account holds RIGHT NOW intersected with the ones on the
 * key. So a key can never do more than its creator — an assistant whose
 * permissions are narrowed later loses them from their keys at the same
 * moment — and never more than what was ticked. See `AgentTokenResolver`.
 *
 * ## The raw key is shown once
 *
 * Only a SHA-256 of it is stored. A key is 32 random bytes, so a plain hash is
 * enough: there is nothing to brute-force, and a lookup by hash means no
 * timing comparison either. Lose it and you make a new one.
 */

/** Every key starts with this, so `AuthGuard` can tell one from a better-auth
 *  session token (also sent as `Authorization: Bearer`, by the Flutter app)
 *  without a database read. */
export const AGENT_TOKEN_PREFIX = 'ayk_';

/** Shape of the raw key: the prefix, then 43 base64url chars (32 bytes). */
export const AGENT_TOKEN_PATTERN = /^ayk_[A-Za-z0-9_-]{43}$/;

/** How many characters after the prefix the screen shows, to tell keys apart. */
export const AGENT_TOKEN_HINT_LENGTH = 6;

/**
 * Never on a key, whatever the creator holds.
 *
 * - `role:*`, `student:role-change`, `staff:*`, `student:set-password`: the
 *   escalation paths. A key that can mint an admin or reset a password is a
 *   key that can make itself unnecessary — and then revoking it achieves
 *   nothing. These are the same ones `NEVER_GRANTABLE` keeps off the roles
 *   screen, for the same reason.
 * - The self-scoped student permissions (`*:submit`, `profile:*`,
 *   `progress:write`, `quiz:attempt`, `enrollment:create`): they act on the
 *   CALLER's own record, and a key acts as a staff account, so they would
 *   mean "submit homework as the teacher". No job needs that.
 */
export const AGENT_TOKEN_WITHHELD: ReadonlySet<string> = new Set([
  'role:read',
  'role:grant',
  'student:role-change',
  'student:set-password',
  'staff:manage',
  'staff:set-password',
  'profile:read',
  'profile:write',
  'progress:write',
  'quiz:attempt',
  'enrollment:create',
  'payment:submit',
  'book-order:submit',
  'homework:submit',
]);

/** Everything a key may carry, in the roles screen's sections. */
export const AGENT_TOKEN_CATEGORIES = PERMISSION_CATEGORIES.map((category) => ({
  ...category,
  permissions: category.permissions.filter((permission) => !AGENT_TOKEN_WITHHELD.has(permission)),
})).filter((category) => category.permissions.length > 0);

export const AGENT_TOKEN_PERMISSIONS: readonly string[] = AGENT_TOKEN_CATEGORIES.flatMap(
  (category) => category.permissions,
);

const KEY_PERMISSION_SET = new Set(AGENT_TOKEN_PERMISSIONS);

/** The lifetimes the screen offers. No «never»: a key that outlives the reason
 *  it was made is the one that leaks. A year is the longest. */
export const AGENT_TOKEN_LIFETIMES_DAYS = [7, 30, 90, 365] as const;

/** At most this many live keys per account — a list nobody can read is a list
 *  nobody revokes from. */
export const AGENT_TOKEN_MAX_ACTIVE = 10;

export const AgentTokenCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  permissions: z
    .array(z.string())
    .min(1)
    .max(AGENT_TOKEN_PERMISSIONS.length)
    .refine((list) => list.every((permission) => KEY_PERMISSION_SET.has(permission)), {
      message: 'unknown or withheld permission',
    })
    .transform((list) => [...new Set(list)]),
  expiresInDays: z
    .number()
    .int()
    .refine((days) => (AGENT_TOKEN_LIFETIMES_DAYS as readonly number[]).includes(days), {
      message: 'unsupported lifetime',
    }),
});
export type AgentTokenCreate = z.infer<typeof AgentTokenCreateSchema>;

export const AgentTokenRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `ayk_AbC123…` — enough to match a key in a config file to its row. */
  hint: z.string(),
  permissions: z.array(z.string()),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
});
export type AgentTokenRow = z.infer<typeof AgentTokenRowSchema>;

export const AgentTokenListSchema = z.object({
  rows: z.array(AgentTokenRowSchema),
  /** What THIS account may put on a key: its own permissions, minus the
   *  withheld ones. The screen draws only these. */
  grantable: z.array(z.string()),
});
export type AgentTokenList = z.infer<typeof AgentTokenListSchema>;

export const AgentTokenCreatedSchema = z.object({
  row: AgentTokenRowSchema,
  /** The raw key. Returned by the create call and never again. */
  token: z.string(),
});
export type AgentTokenCreated = z.infer<typeof AgentTokenCreatedSchema>;

/** `GET /api/agent/me` — what the key in hand can do, for the MCP server. */
export const AgentMeSchema = z.object({
  token: z.object({ id: z.string(), name: z.string(), expiresAt: z.string() }),
  user: z.object({ id: z.string(), name: z.string(), role: z.string() }),
  /** Effective: the key's permissions the account still holds. */
  permissions: z.array(z.string()),
});
export type AgentMe = z.infer<typeof AgentMeSchema>;
