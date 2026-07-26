import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * The authenticated user, as attached to the request by `AuthGuard`. Mirrors
 * Better Auth's `User` model plus the `role` field registered as a
 * `user.additionalFields` entry in `../auth.config` — see that file for why
 * `role` would otherwise be stripped from the session response.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface RequestWithUser {
  user?: AuthenticatedUser;
}

/**
 * Extracts the authenticated user `AuthGuard` attached to the request. Only
 * meaningful on routes the guard actually let through with a session — a
 * `@Public()` route has no user, so this resolves to `undefined` there.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
