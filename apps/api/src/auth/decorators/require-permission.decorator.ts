import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Requires the authenticated user's role to hold `permission` — a
 * `resource:action` string checked against the role→permission map in
 * `../permissions` (never a role equality check). Implies authentication:
 * do not also mark the route `@Public()`.
 */
export const RequirePermission = (permission: string): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, permission);
