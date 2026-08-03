import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator';
import { type Permission, permissionsForRole } from './permissions';

export interface SessionResponse {
  id: string;
  email: string;
  /**
   * Both come straight from the identity provider on a social sign-up (Better
   * Auth writes them to `User` from Google's `userinfo`), and from the
   * registration form on an email/password one. Exposed so a signed-in
   * surface can greet the student by name and show their avatar without a
   * second round trip — `/onboarding` prefills its own name field from this
   * rather than making someone retype what Google already told us.
   *
   * `image` is nullable for a reason: an email/password account never has
   * one, and Google accounts without a profile photo don't either. Every
   * consumer needs a fallback.
   */
  name: string;
  image: string | null;
  role: string;
  permissions: readonly Permission[];
}

/**
 * No `@Public()` here — deliberately left undecorated. Two reasons: it's the
 * minimal "am I logged in" echo every frontend needs, and it doubles as a
 * live, not just unit-tested, proof that `AuthGuard`'s deny-by-default holds
 * for an ordinary production route with zero decorators.
 *
 * `permissions` exists so the web app can decide what to RENDER without ever
 * writing `role === 'admin'`. It is not an authorization decision: the guard
 * re-checks on every request, and a client that lies about its own permission
 * list simply gets a 403 from the API it then calls.
 */
@Controller('session')
export class SessionController {
  @Get()
  me(@CurrentUser() user: AuthenticatedUser): SessionResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      role: user.role,
      permissions: permissionsForRole(user.role),
    };
  }
}
