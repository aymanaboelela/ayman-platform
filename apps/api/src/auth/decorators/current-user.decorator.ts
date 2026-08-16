import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * The authenticated user, as attached to the request by `AuthGuard`. Mirrors
 * Better Auth's `User` model plus the `role` field registered as a
 * `user.additionalFields` entry in `../auth.config` — see that file for why
 * `role` would otherwise be stripped from the session response.
 */
export interface AuthenticatedUser {
  id: string;
  /**
   * ⚠️ May be a SYNTHESISED address (`…@phone.invalid`) for a student who
   * registered by phone and gave no email — Better Auth's `email` column
   * cannot be null, so one is minted from the number. Never render this
   * without `isPlaceholderEmail`; `SessionController` already nulls it out on
   * the way to the web app, which is the safer place to do it.
   */
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  /**
   * The account's real identity now. Nullable for accounts created before the
   * column existed and for a Google sign-up between the OAuth callback and
   * onboarding step 1 — see `schema.prisma`'s note on `User.phoneNumber`.
   */
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean | null;
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
