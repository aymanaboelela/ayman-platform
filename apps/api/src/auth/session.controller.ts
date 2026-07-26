import { Controller, Get } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator';

/**
 * No `@Public()` here — deliberately left undecorated. Two reasons: it's the
 * minimal "am I logged in" echo every frontend needs (Task 5's login flow),
 * and it doubles as a live, not just unit-tested, proof that `AuthGuard`'s
 * deny-by-default holds for an ordinary production route with zero
 * decorators — Task 2's two other controllers (health, taxonomy) are both
 * intentionally `@Public()`, so without this there is no real HTTP route
 * left to curl for the 401 case.
 */
@Controller('session')
export class SessionController {
  @Get()
  me(@CurrentUser() user: AuthenticatedUser): { id: string; email: string; role: string } {
    return { id: user.id, email: user.email, role: user.role };
  }
}
