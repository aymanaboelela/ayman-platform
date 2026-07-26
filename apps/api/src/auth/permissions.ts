/**
 * Permissions are `resource:action` strings, checked against a role→permission
 * map — never role equality (Plan 2 Global Constraint #9). `ROLE_PERMISSIONS`
 * below is the *only* place a role name is ever looked up; everywhere else
 * (the guard, decorators, controllers) only ever asks "does this role hold
 * this permission?" via `roleHasPermission`, never "is this role admin?".
 */

export type Role = 'admin' | 'student';

/** `'*'` grants every permission without having to enumerate them. */
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<string> | '*'> = {
  admin: '*',
  student: new Set(['profile:read', 'profile:write', 'course:read']),
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
