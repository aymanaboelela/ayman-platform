import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * The `session` half of what `AuthGuard` resolves from `getSession()` —
 * `../better-auth.token`'s `BetterAuthSessionResult['session']`. Kept as a
 * loose `{ id: string; [key: string]: unknown }` here too, for the same
 * reason `AuthenticatedUser` doesn't import the real Better Auth types: this
 * file must stay import-clean of `better-auth` itself.
 */
export interface AuthenticatedSession {
  id: string;
  [key: string]: unknown;
}

interface RequestWithSession {
  session?: AuthenticatedSession;
}

/**
 * Extracts the current session `AuthGuard` attached to the request —
 * distinct from `@CurrentUser()`, which extracts the *user*. Task 7's
 * `SessionsController` needs the session's own `id` to mark which row in
 * `GET /api/sessions` is the one answering the request right now, so a
 * student cannot revoke themselves without realising it.
 */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSession | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    return request.session;
  },
);
