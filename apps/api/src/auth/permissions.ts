/**
 * Permissions are `resource:action` strings, checked against a role→permission
 * map — never role equality (Plan 2 Global Constraint #9 / Plan 6 Global
 * Constraint 7). `ROLE_PERMISSIONS` below is the *only* place a role name is
 * ever looked up; everywhere else (the guard, decorators, controllers) only
 * ever asks "does this role hold this permission?" via `roleHasPermission`,
 * never "is this role admin?".
 *
 * Each plan APPENDS its own permissions to this catalogue — it is never
 * replaced. Dropping an entry here would revoke it from every route that
 * carries it, and the only symptom would be 403s in production.
 *
 * Shape is strictly `^[a-z][a-z-]*:[a-z][a-z-]*$` — two segments, one colon.
 */
export const PERMISSIONS = [
  // student-facing (Plan 2)
  'course:read',
  'profile:read',
  'profile:write',
  // content authoring (Plan 3) — DO NOT DROP
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
  // progress (Plan 4) — DO NOT DROP
  'progress:read',
  'progress:write',
  // quiz (Plan 5) — DO NOT DROP
  'question:read',
  'question:write',
  'quiz:read',
  'quiz:write',
  'quiz:attempt',
  'quiz:grade',
  'attempt:grade',
  'appeal:create',
  'analytics:read',
  // admin shell (Plan 6)
  'admin:access',
  // platform configuration (Plan 6)
  'settings:read',
  'settings:write',
  'flags:read',
  'flags:write',
  'nav:read',
  'nav:write',
  'home:read',
  'home:write',
  'media:read',
  'media:write',
  'media:delete',
  'taxonomy:read',
  'taxonomy:write',
  'student:read',
  'student:write',
  'student:role-change',
  'attempt:read',
  'attempt:unlock',
  'appeal:read',
  'appeal:resolve',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role = 'admin' | 'student';

/**
 * `'*'` grants every permission, including ones added after this line was
 * written — that is deliberate. `permissionsForRole` materialises it into the
 * concrete catalogue for the client, which needs a list rather than a wildcard.
 *
 * `course:create`, `course:update`, `course:publish`, `course:delete`,
 * `section:write`, `section:reorder`, `lesson:write`, `lesson:reorder` and the
 * whole Plan 6 admin surface are held only through `admin: '*'` — nothing here
 * grants them to `student`, so adding an `editor` role later is one entry in
 * this map and zero changes anywhere else.
 */
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission> | '*'> = {
  admin: '*',
  // RECONCILED: this is the accumulated set from Plans 2–5. Keep it in sync
  // with the assertion in permissions.spec.ts; shrinking it is a silent
  // regression that only shows up as a 403 for a legitimate student.
  student: new Set<Permission>([
    'profile:read', // Plan 2
    'profile:write', // Plan 2
    'course:read', // Plan 2
    'enrollment:read', // Plan 3
    'enrollment:create', // Plan 3
    'progress:read', // Plan 4
    // Plan 4 — self-scoped only; every write resolves through an
    // ownership-scoped query, never a permission-level check, so holding this
    // does not let a student write another student's progress row.
    'progress:write',
    // Quiz (Plan 5). A student may read a quiz's public shape, run their own
    // attempts, and open an appeal. Authoring, grading, unlocking and
    // analytics are admin-only and are never granted here.
    'quiz:read',
    'quiz:attempt',
    'appeal:create',
  ]),
};

const KNOWN_ROLES = new Set<string>(Object.keys(ROLE_PERMISSIONS));

function isKnownRole(role: string): role is Role {
  return KNOWN_ROLES.has(role);
}

/**
 * Whether `role` grants `permission`. An unrecognised or missing role holds
 * no permissions — fail closed, same principle as the guard's S12 handling.
 */
export function roleHasPermission(role: string | undefined | null, permission: string): boolean {
  if (!role || !isKnownRole(role)) return false;
  const granted = ROLE_PERMISSIONS[role];
  return granted === '*' || granted.has(permission as Permission);
}

/**
 * The concrete permission list for a role. The web app uses this to decide
 * what to *render*; it is never the authorization decision itself — that is
 * always the guard, on the server, per request.
 */
export function permissionsForRole(role: string | undefined | null): readonly Permission[] {
  if (!role || !isKnownRole(role)) return [];
  const granted = ROLE_PERMISSIONS[role];
  if (granted === '*') return PERMISSIONS;
  return PERMISSIONS.filter((permission) => granted.has(permission));
}
