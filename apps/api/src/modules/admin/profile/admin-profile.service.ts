import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type {
  AdminChangePasswordInput,
  AdminChangePasswordResult,
  AdminPasswordErrorCode,
  AdminProfile,
  AdminUpdateProfileInput,
} from '@ayman/contracts/admin/profile';
import { isPlaceholderEmail, normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { ARGON2_OPTIONS } from '../../../auth/argon2-options';
import { loginThrottle } from '../../../auth/login-throttle.instance';
import {
  accountThrottleKey,
  emailIdentifier,
  phoneIdentifier,
  throttleKeyFor,
} from '../../../auth/credential-check.service';
import { permissionsForUser } from '../../../auth/permissions';

const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class AdminProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(userId: string): Promise<AdminProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({ code: 'user_not_found' });
    }

    const activeSessionsCount = await this.prisma.session.count({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email ?? null,
      phoneNumber: user.phoneNumber ?? null,
      role: user.role,
      image: user.image ?? null,
      createdAt: user.createdAt.toISOString(),
      activeSessionsCount,
      permissions: [...permissionsForUser(user.id, user.role)],
    };
  }

  /**
   * Name and phone, by the admin themself.
   *
   * The phone is NORMALISED on the way in, with the exact function sign-up and
   * sign-in use (`normalizeEgyptianPhone`). It was stored as typed: Better
   * Auth's phone plugin never normalises, so an admin who saved `01012345678`
   * here could no longer sign in with it — sign-in normalises to
   * `+201012345678` and finds no such account. And it may not be CLEARED on an
   * account with no real email, because the phone is then the only way in.
   */
  async updateProfile(userId: string, data: AdminUpdateProfileInput): Promise<AdminProfile> {
    let phoneNumber: string | null | undefined;
    if (data.phoneNumber !== undefined) {
      const typed = data.phoneNumber?.trim() ?? '';
      phoneNumber = typed === '' ? null : normalizeEgyptianPhone(typed);
      if (typed !== '' && phoneNumber === null) {
        throw new BadRequestException({ code: 'phone_invalid' });
      }
      if (phoneNumber === null) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user?.email || isPlaceholderEmail(user.email)) {
          throw new BadRequestException({ code: 'phone_required' });
        }
      }
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(phoneNumber !== undefined ? { phoneNumber } : {}),
        },
      });

      await this.audit.record({
        action: 'staff:update',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'success',
        metadata: { selfUpdate: true, updatedFields: Object.keys(data) },
      });

      return this.getProfile(userId);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === PRISMA_UNIQUE_VIOLATION
      ) {
        throw new ConflictException({ code: 'phone_taken' });
      }
      throw err;
    }
  }

  /**
   * «تغيير كلمة السر» — by the signed-in admin, for their own account.
   *
   * ## It never signs anyone out by accident
   *
   * The CURRENT session — the request's own, from `AuthGuard` — is kept in
   * every branch. Other sessions end only when `revokeOtherSessions` is true,
   * which the form leaves OFF by default (see `AdminChangePasswordSchema`).
   * If the current session cannot be identified, nothing is revoked at all:
   * the old fallback deleted EVERY session of the user, which is "change your
   * password and get thrown out mid-sentence".
   *
   * Revoking stamps `session_devices.revoked_at` and deletes the Better Auth
   * rows behind them — the same two writes `SessionDeviceService.revokeOwn`
   * makes — rather than deleting the device rows: that table is the account's
   * sign-in log, and `device-limit.ts` counts it.
   *
   * ## Refusals are codes
   *
   * `ADMIN_PASSWORD_ERROR_CODES`, in the 400's body; the screen owns the
   * sentence. These used to be Modern Standard Arabic messages printed as-is.
   */
  async changePassword(
    userId: string,
    currentSessionId: string | undefined,
    data: AdminChangePasswordInput,
  ): Promise<AdminChangePasswordResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phoneNumber: true },
    });

    if (!user) {
      throw new NotFoundException({ code: 'user_not_found' });
    }

    const account = await this.prisma.account.findFirst({
      where: {
        userId,
        providerId: 'credential',
      },
    });

    if (!account || !account.password) {
      throw new BadRequestException({ code: 'no_credential_account' satisfies AdminPasswordErrorCode });
    }

    // A hash argon2 cannot parse throws rather than answering false — treated
    // as a wrong password, never as a 500 that reads like an outage.
    const isValid = await argon2.verify(account.password, data.currentPassword).catch(() => false);
    if (!isValid) {
      throw new BadRequestException({ code: 'current_password_incorrect' satisfies AdminPasswordErrorCode });
    }

    if (data.newPassword === data.currentPassword) {
      throw new BadRequestException({ code: 'password_unchanged' satisfies AdminPasswordErrorCode });
    }

    const passwordHash = await argon2.hash(data.newPassword, ARGON2_OPTIONS);

    let revokedSessions = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { password: passwordHash },
      });

      if (data.revokeOtherSessions && currentSessionId) {
        await tx.sessionDevice.updateMany({
          where: { userId, revokedAt: null, sessionId: { not: currentSessionId } },
          data: { revokedAt: new Date() },
        });
        const removed = await tx.session.deleteMany({
          where: { userId, id: { not: currentSessionId } },
        });
        revokedSessions = removed.count;
      }
    });

    // A lockout earned with the OLD password must not outlive it.
    if (user.phoneNumber) {
      loginThrottle.clear(throttleKeyFor(phoneIdentifier(user.phoneNumber)));
    }
    if (user.email) {
      loginThrottle.clear(throttleKeyFor(emailIdentifier(user.email)));
    }
    loginThrottle.clear(accountThrottleKey(userId));

    await this.audit.record({
      action: 'staff:set-password',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: {
        selfChange: true,
        revokeOtherSessions: data.revokeOtherSessions,
        revokedSessions,
      },
    });

    // `message` for a web container still on the previous build, whose result
    // schema requires it — it parses the field and never prints it.
    return { status: true, message: 'password_changed', revokedSessions };
  }
}
