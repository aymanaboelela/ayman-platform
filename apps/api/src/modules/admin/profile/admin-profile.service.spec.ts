import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AdminProfileService } from './admin-profile.service';
import { ARGON2_OPTIONS } from '../../../auth/argon2-options';

describe('AdminProfileService', () => {
  let service: AdminProfileService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    session: { count: jest.Mock; deleteMany: jest.Mock };
    sessionDevice: { deleteMany: jest.Mock };
    account: { findFirst: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      sessionDevice: {
        deleteMany: jest.fn(),
      },
      account: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    service = new AdminProfileService(prisma, audit);
  });

  describe('getProfile', () => {
    it('returns formatted admin profile with active session count', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'م. أيمن أبو العلا',
        email: 'ayman@example.com',
        phoneNumber: '+201012345678',
        role: 'admin',
        image: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      prisma.session.count.mockResolvedValue(2);

      const result = await service.getProfile('u1');

      expect(result).toMatchObject({
        id: 'u1',
        name: 'م. أيمن أبو العلا',
        email: 'ayman@example.com',
        phoneNumber: '+201012345678',
        role: 'admin',
        activeSessionsCount: 2,
      });
    });

    it('throws NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('updates user details and records audit', async () => {
      prisma.user.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'اسم جديد',
        email: 'ayman@example.com',
        phoneNumber: '+201099999999',
        role: 'admin',
        image: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      prisma.session.count.mockResolvedValue(1);

      const result = await service.updateProfile('u1', {
        name: 'اسم جديد',
        phoneNumber: '+201099999999',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'اسم جديد', phoneNumber: '+201099999999' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'staff:update',
          resourceType: 'user',
          resourceId: 'u1',
        }),
      );
      expect(result.name).toBe('اسم جديد');
    });

    it('throws ConflictException on duplicate phone number (P2002)', async () => {
      prisma.user.update.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.updateProfile('u1', { phoneNumber: '+201011111111' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('changes password successfully when current password matches', async () => {
      const oldHash = await argon2.hash('OldPassword123!', ARGON2_OPTIONS);

      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'ayman@example.com',
        phoneNumber: '+201012345678',
      });
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc1',
        userId: 'u1',
        providerId: 'credential',
        password: oldHash,
      });
      prisma.account.update.mockResolvedValue({});
      prisma.session.deleteMany.mockResolvedValue({});
      prisma.sessionDevice.deleteMany.mockResolvedValue({});

      const result = await service.changePassword('u1', 'sess-current', {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewStrongPassword456!',
        revokeOtherSessions: true,
      });

      expect(result.status).toBe(true);
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc1' },
        }),
      );
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', id: { not: 'sess-current' } },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'staff:set-password',
          resourceType: 'user',
          resourceId: 'u1',
        }),
      );
    });

    it('throws BadRequestException when current password is wrong', async () => {
      const oldHash = await argon2.hash('OldPassword123!', ARGON2_OPTIONS);

      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc1',
        userId: 'u1',
        providerId: 'credential',
        password: oldHash,
      });

      await expect(
        service.changePassword('u1', 'sess-current', {
          currentPassword: 'WrongPassword!',
          newPassword: 'NewStrongPassword456!',
          revokeOtherSessions: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when new password equals current password', async () => {
      const oldHash = await argon2.hash('SamePassword123!', ARGON2_OPTIONS);

      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc1',
        userId: 'u1',
        providerId: 'credential',
        password: oldHash,
      });

      await expect(
        service.changePassword('u1', 'sess-current', {
          currentPassword: 'SamePassword123!',
          newPassword: 'SamePassword123!',
          revokeOtherSessions: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if no password credential account exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword('u1', 'sess-current', {
          currentPassword: 'AnyPassword!',
          newPassword: 'NewStrongPassword456!',
          revokeOtherSessions: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
