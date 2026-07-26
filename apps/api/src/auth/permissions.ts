/**
 * Permissions are `resource:action` strings, checked against a role→permission
 * map — never role equality (Plan 2 Global Constraint #9). `ROLE_PERMISSIONS`
 * below is the *only* place a role name is ever looked up; everywhere else
 * (the guard, decorators, controllers) only ever asks "does this role hold
 * this permission?" via `roleHasPermission`, never "is this role admin?".
 */

export type Role = 'admin' | 'student';

/**
 * `course:create`, `course:update`, `course:publish`, `course:delete`,
 * `section:write`, `section:reorder`, `lesson:write`, `lesson:reorder` are
 * held only through `admin: '*'` below — nothing here grants them to
 * `student`, so adding an `editor` role later is one entry in this map and
 * zero changes anywhere else.
 */

/** `'*'` grants every permission without having to enumerate them. */
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<string> | '*'> = {
  admin: '*',
  student: new Set([
    'profile:read',
    'profile:write',
    'course:read',
    'enrollment:read',
    'enrollment:create',
    'progress:read', // Plan 4
    'progress:write', // Plan 4 — self-scoped only; every write resolves through
    // an ownership-scoped query, never a permission-level check, so holding
    // this does not let a student write another student's progress row
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
  return granted === '*' || granted.has(permission);
}
