import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminChangePasswordInput,
  AdminChangePasswordResult,
  AdminProfile,
  AdminUpdateProfileInput,
} from '@ayman/contracts/admin/profile';
import { isPlaceholderEmail, normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { changeOwnPassword } from '../../../auth/change-own-password';
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
   * «تغيير كلمة السر» — by the signed-in admin, for their own account. The
   * body is shared with the student's `/profile` form: see
   * `auth/change-own-password.ts` for why the current session always stays.
   */
  changePassword(
    userId: string,
    currentSessionId: string | undefined,
    data: AdminChangePasswordInput,
  ): Promise<AdminChangePasswordResult> {
    return changeOwnPassword({ prisma: this.prisma, audit: this.audit }, userId, currentSessionId, data, 'staff:set-password');
  }
}
