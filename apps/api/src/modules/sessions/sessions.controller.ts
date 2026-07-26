import { Controller, Delete, Get, HttpCode, NotFoundException, Param } from '@nestjs/common';
import { CurrentSession, type AuthenticatedSession } from '../../auth/decorators/current-session.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { SessionDeviceService, type SessionDeviceView } from './session-device.service';

/**
 * `أجهزتي` — own sessions/devices only. No `@RequirePermission(...)` here on
 * purpose: this is inherently self-scoped (a user manages their OWN
 * sessions, never anyone else's — the ownership check lives in the query,
 * not in a permission string), and it mirrors `SessionController`
 * (`GET /api/session`, Task 2) which is likewise gated only by
 * authentication. It also keeps Plan 2's final permission set exactly
 * `profile:read` / `profile:write` / `course:read`, matching the
 * cross-plan-reconciled table in `docs/superpowers/plans/README.md` — this
 * task does not introduce a new `session:*` permission string.
 */
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionDevices: SessionDeviceService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<SessionDeviceView[]> {
    return this.sessionDevices.listOwn(user.id, session?.id);
  }

  /**
   * 404, never 403, on someone else's (or a nonexistent, or already-revoked)
   * device id — see `SessionDeviceService.revokeOwn`'s comment. A 403 would
   * itself be an information leak: it confirms the id belongs to *someone*.
   */
  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    const revoked = await this.sessionDevices.revokeOwn(user.id, id);
    if (!revoked) {
      throw new NotFoundException();
    }
  }
}
