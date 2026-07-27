import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator';
import { type Permission, permissionsForRole } from './permissions';

export interface SessionResponse {
  id: string;
  email: string;
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
      role: user.role,
      permissions: permissionsForRole(user.role),
    };
  }
}
