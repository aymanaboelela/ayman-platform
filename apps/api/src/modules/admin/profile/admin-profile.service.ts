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
  AdminProfile,
  AdminUpdateProfileInput,
} from '@ayman/contracts/admin/profile';
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
      throw new NotFoundException('المستخدم غير موجود');
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

  async updateProfile(userId: string, data: AdminUpdateProfileInput): Promise<AdminProfile> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.phoneNumber !== undefined ? { phoneNumber: data.phoneNumber } : {}),
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
        throw new ConflictException('رقم الهاتف مسجل لحساب آخر بالفعل');
      }
      throw err;
    }
  }

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
      throw new NotFoundException('المستخدم غير موجود');
    }

    const account = await this.prisma.account.findFirst({
      where: {
        userId,
        providerId: 'credential',
      },
    });

    if (!account || !account.password) {
      throw new BadRequestException('لا توجد كلمة مرور مسجلة لهذا الحساب (مسجل عبر وسيلة دخول خارجية)');
    }

    const isValid = await argon2.verify(account.password, data.currentPassword);
    if (!isValid) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    }

    if (data.newPassword === data.currentPassword) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تكون مختلفة عن كلمة المرور الحالية');
    }

    const passwordHash = await argon2.hash(data.newPassword, ARGON2_OPTIONS);

    await this.prisma.account.update({
      where: { id: account.id },
      data: { password: passwordHash },
    });

    // تفريغ أي قفل لمحاولات الدخول الخاطئة السابقة
    if (user.phoneNumber) {
      loginThrottle.clear(throttleKeyFor(phoneIdentifier(user.phoneNumber)));
    }
    if (user.email) {
      loginThrottle.clear(throttleKeyFor(emailIdentifier(user.email)));
    }
    loginThrottle.clear(accountThrottleKey(userId));

    // تسجيل الخروج من باقي الأجهزة إذا تم اختياره
    if (data.revokeOtherSessions) {
      if (currentSessionId) {
        await this.prisma.session.deleteMany({
          where: {
            userId,
            id: { not: currentSessionId },
          },
        });
        await this.prisma.sessionDevice.deleteMany({
          where: {
            userId,
            sessionId: { not: currentSessionId },
          },
        });
      } else {
        await this.prisma.session.deleteMany({
          where: { userId },
        });
        await this.prisma.sessionDevice.deleteMany({
          where: { userId },
        });
      }
    }

    await this.audit.record({
      action: 'staff:set-password',
      resourceType: 'user',
      resourceId: userId,
      outcome: 'success',
      metadata: {
        selfChange: true,
        revokeOtherSessions: data.revokeOtherSessions,
      },
    });

    return {
      status: true,
      message: 'تم تغيير كلمة المرور بنجاح',
    };
  }
}
