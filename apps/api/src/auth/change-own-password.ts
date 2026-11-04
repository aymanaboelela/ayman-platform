import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import type {
  AdminChangePasswordInput,
  AdminChangePasswordResult,
  AdminPasswordErrorCode,
} from '@ayman/contracts/admin/profile';
import type { AuditAction } from '@ayman/contracts/admin/audit';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { ARGON2_OPTIONS } from './argon2-options';
import { loginThrottle } from './login-throttle.instance';
import { accountThrottleKey, emailIdentifier, phoneIdentifier, throttleKeyFor } from './credential-check.service';

/**
 * «تغيير كلمة السر» — a signed-in user changing their OWN password, from
 * either side of the platform: the admin's `/admin/profile` and the student's
 * `/profile`. One body so the two can never drift on the parts that matter;
 * only the audit action differs, because «a staff member changed their
 * password» and «a student did» are read by different people.
 *
 * ## It never signs anyone out by accident
 *
 * The CURRENT session — the request's own, from `AuthGuard` — is kept in
 * every branch. Other sessions end only when `revokeOtherSessions` is true,
 * which both forms leave OFF by default (see `AdminChangePasswordSchema`).
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
 * `ADMIN_PASSWORD_ERROR_CODES`, in the 400's body; each screen owns the
 * sentence.
 */
export async function changeOwnPassword(
  deps: { prisma: PrismaService; audit: AuditService },
  userId: string,
  currentSessionId: string | undefined,
  data: AdminChangePasswordInput,
  action: Extract<AuditAction, 'staff:set-password' | 'user:password-change'>,
): Promise<AdminChangePasswordResult> {
  const { prisma, audit } = deps;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, phoneNumber: true },
  });

  if (!user) {
    throw new NotFoundException({ code: 'user_not_found' });
  }

  const account = await prisma.account.findFirst({
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
  await prisma.$transaction(async (tx) => {
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

  await audit.record({
    action,
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
