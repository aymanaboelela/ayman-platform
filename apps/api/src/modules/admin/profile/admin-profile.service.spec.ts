import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AdminProfileService } from './admin-profile.service';
import { ARGON2_OPTIONS } from '../../../auth/argon2-options';

/** The 400's body, so a test can assert the CODE the screen maps to words. */
async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof ConflictException) return error.getResponse();
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('AdminProfileService', () => {
  let service: AdminProfileService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    session: { count: jest.Mock; deleteMany: jest.Mock };
    sessionDevice: { updateMany: jest.Mock; deleteMany: jest.Mock };
    account: { findFirst: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      session: { count: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      sessionDevice: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn(),
      },
      account: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      // The interactive form: the callback receives the same client, so the
      // writes inside it land on the mocks above.
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AdminProfileService(prisma as never, audit as never);
  });

  describe('getProfile', () => {
    it('returns the profile with the open-session count', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'أحمد محمود',
        email: 'admin@example.test',
        phoneNumber: '+201012345678',
        role: 'admin',
        image: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      prisma.session.count.mockResolvedValue(2);

      const result = await service.getProfile('u1');

      expect(result).toMatchObject({ id: 'u1', role: 'admin', activeSessionsCount: 2 });
    });

    it('404s for an account that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    const profileRow = {
      id: 'u1',
      name: 'اسم جديد',
      email: 'admin@example.test',
      phoneNumber: '+201099999999',
      role: 'admin',
      image: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('stores the phone in E.164 — the form the sign-in lookup normalises to', async () => {
      prisma.user.update.mockResolvedValue({});
      prisma.user.findUnique.mockResolvedValue(profileRow);
      prisma.session.count.mockResolvedValue(1);

      await service.updateProfile('u1', { name: 'اسم جديد', phoneNumber: '01099999999' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'اسم جديد', phoneNumber: '+201099999999' },
      });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'staff:update' }));
    });

    it('refuses a number that is not an Egyptian mobile, before writing', async () => {
      expect(await refusal(service.updateProfile('u1', { phoneNumber: '12345' }))).toEqual({ code: 'phone_invalid' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to clear the phone on an account with no real email — it is the only way in', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: null });
      expect(await refusal(service.updateProfile('u1', { phoneNumber: '' }))).toEqual({ code: 'phone_required' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('answers a taken number with a code, not a sentence', async () => {
      prisma.user.update.mockRejectedValue({ code: 'P2002' });
      expect(await refusal(service.updateProfile('u1', { phoneNumber: '01011111111' }))).toEqual({
        code: 'phone_taken',
      });
    });
  });

  describe('changePassword', () => {
    async function withPassword(password: string) {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'admin@example.test', phoneNumber: '+201012345678' });
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc1',
        userId: 'u1',
        providerId: 'credential',
        password: await argon2.hash(password, ARGON2_OPTIONS),
      });
    }

    it('changes the password and signs NOBODY out when not asked to', async () => {
      await withPassword('OldPassword123!');

      const result = await service.changePassword('u1', 'sess-current', {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewStrongPassword456!',
        revokeOtherSessions: false,
      });

      expect(result).toMatchObject({ status: true, revokedSessions: 0 });
      const stored = prisma.account.update.mock.calls[0]![0] as { data: { password: string } };
      expect(await argon2.verify(stored.data.password, 'NewStrongPassword456!')).toBe(true);
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
      expect(prisma.sessionDevice.updateMany).not.toHaveBeenCalled();
    });

    it('when asked, ends every OTHER session and keeps this one', async () => {
      await withPassword('OldPassword123!');
      prisma.session.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.changePassword('u1', 'sess-current', {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewStrongPassword456!',
        revokeOtherSessions: true,
      });

      expect(result.revokedSessions).toBe(3);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', id: { not: 'sess-current' } },
      });
      // Stamped, not deleted — the device table is the sign-in log.
      expect(prisma.sessionDevice.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null, sessionId: { not: 'sess-current' } },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.sessionDevice.deleteMany).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'staff:set-password', resourceId: 'u1' }),
      );
    });

    it('revokes nothing at all when the current session cannot be identified', async () => {
      // The old fallback deleted EVERY session of the user here — the admin
      // included, mid-change.
      await withPassword('OldPassword123!');

      await service.changePassword('u1', undefined, {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewStrongPassword456!',
        revokeOtherSessions: true,
      });

      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
      expect(prisma.sessionDevice.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a wrong current password with a code', async () => {
      await withPassword('OldPassword123!');
      const body = await refusal(
        service.changePassword('u1', 'sess-current', {
          currentPassword: 'WrongPassword!',
          newPassword: 'NewStrongPassword456!',
          revokeOtherSessions: false,
        }),
      );
      expect(body).toEqual({ code: 'current_password_incorrect' });
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('treats a hash argon2 cannot read as a wrong password, not a 500', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: null, phoneNumber: null });
      prisma.account.findFirst.mockResolvedValue({ id: 'acc1', password: 'not-an-argon2-hash' });
      const body = await refusal(
        service.changePassword('u1', 'sess-current', {
          currentPassword: 'Whatever123!',
          newPassword: 'NewStrongPassword456!',
          revokeOtherSessions: false,
        }),
      );
      expect(body).toEqual({ code: 'current_password_incorrect' });
    });

    it('refuses a new password equal to the current one', async () => {
      await withPassword('SamePassword123!');
      const body = await refusal(
        service.changePassword('u1', 'sess-current', {
          currentPassword: 'SamePassword123!',
          newPassword: 'SamePassword123!',
          revokeOtherSessions: false,
        }),
      );
      expect(body).toEqual({ code: 'password_unchanged' });
    });

    it('refuses an account that signs in without a password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.account.findFirst.mockResolvedValue(null);
      const body = await refusal(
        service.changePassword('u1', 'sess-current', {
          currentPassword: 'AnyPassword!',
          newPassword: 'NewStrongPassword456!',
          revokeOtherSessions: false,
        }),
      );
      expect(body).toEqual({ code: 'no_credential_account' });
    });
  });
});
