import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Requires the authenticated user's role to hold `permission` — a
 * `resource:action` string checked against the role→permission map in
 * `../permissions` (never a role equality check). Implies authentication:
 * do not also mark the route `@Public()`.
 *
 * The parameter is typed as `Permission` on purpose (Plan 6 Task 1):
 * `@RequirePermission('setings:write')` is now a compile error rather than a
 * route that silently denies everyone forever.
 */
export const RequirePermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, permission);
