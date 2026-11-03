import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappRestrictedError } from '../marketing/whatsapp-device.service';
import { PasswordResetService, type PasswordResetOptions } from './password-reset.service';

/**
 * «نسيت كلمة السر» against the real database.
 *
 * Integration, not unit, because every property that matters here is a
 * property of SQL: the limits are counts over the table, the attempt cap and
 * single use are conditional `UPDATE`s racing each other, and the "no code
 * until delivered" rule is a CHECK constraint. A mocked Prisma would be
 * asserting the mock.
 *
 * The WhatsApp device is the one fake: nothing in this file reaches a socket.
 * Every number and client address is random per test, so the shared local
 * database's leftovers cannot trip a per-number or per-client limit; the
 * stack-wide caps are lifted out of the way except in the test about them.
 */

const SECRET = 'password-reset-int-spec-secret-0123456789';
const OPEN: PasswordResetOptions['limits'] = {
  requestsPerHour: 1_000_000,
  requestsPerDay: 1_000_000,
  sendsPerHour: 1_000_000,
  sendsPerDay: 1_000_000,
};

function phone(): string {
  return `+2010${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
}
function ip(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(0, 256)}`;
}
function codeIn(text: string): string {
  return /\b(\d{6})\b/u.exec(text)![1]!;
}

type Sent = { phone: string; text: string; source?: string };

function fakeDevice(overrides: Record<string, unknown> = {}) {
  const sent: Sent[] = [];
  const device = {
    sent,
    enabled: true,
    status: jest.fn(async () => ({
      state: 'connected',
      phone: '+201000000000',
      qr: null,
      pairingCode: null,
      detail: null,
      connectedAt: null,
      limits: null,
    })),
    send: jest.fn(async (input: Sent) => {
      sent.push(input);
      return { messageId: `m-${randomUUID()}` };
    }),
    ...overrides,
  };
  return device;
}

describe('PasswordResetService (real database)', () => {
  let prisma: PrismaService;
  const audit = { record: jest.fn(async () => ({})) };
  const users: string[] = [];
  const phones: string[] = [];

  function service(device: ReturnType<typeof fakeDevice>, options: PasswordResetOptions = {}) {
    return new PasswordResetService(prisma, device as never, audit as never, {
      secret: SECRET,
      humanCheck: null,
      ...options,
      limits: { ...OPEN, ...(options.limits ?? {}) },
    });
  }

  async function student(opts: { role?: string; banned?: boolean; password?: string | null; google?: boolean } = {}) {
    const id = randomUUID();
    const number = phone();
    users.push(id);
    phones.push(number);
    await prisma.user.create({
      data: {
        id,
        name: 'طالب تجربة',
        role: opts.role ?? 'student',
        phoneNumber: number,
        ...(opts.banned ? { bannedAt: new Date() } : {}),
      },
    });
    if (opts.password !== null) {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          providerId: 'credential',
          accountId: id,
          userId: id,
          password: await argon2.hash(opts.password ?? 'old-password-1'),
        },
      });
    }
    if (opts.google) {
      await prisma.account.create({
        data: { id: randomUUID(), providerId: 'google', accountId: `g-${id}`, userId: id },
      });
    }
    return { id, phone: number };
  }

  function unknownNumber() {
    const number = phone();
    phones.push(number);
    return number;
  }

  async function rows(number: string) {
    return prisma.passwordResetRequest.findMany({ where: { phone: number }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  }

  async function requestAndDeliver(svc: PasswordResetService, number: string, from = ip()) {
    const { outcome, delivery } = await svc.request({ phone: number, ipBucket: from, remoteIp: from, captchaToken: null });
    await delivery;
    return outcome;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.passwordResetRequest.deleteMany({ where: { phone: { in: phones } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.account.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  describe('no enumeration', () => {
    it('answers a registered student and a made-up number identically, and messages only the student', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const unknown = unknownNumber();

      const a = await requestAndDeliver(svc, known.phone);
      const b = await requestAndDeliver(svc, unknown);

      expect(a).toEqual({ status: 'accepted' });
      expect(b).toEqual(a);
      expect(device.sent.map((s) => s.phone)).toEqual([known.phone]);
      expect(device.sent[0]!.source).toBe('otp');
      expect((await rows(unknown)).map((r) => r.status)).toEqual(['no_account']);
      expect((await rows(known.phone)).map((r) => r.status)).toEqual(['sent']);
    });

    it('does not answer before the account is looked up — the response is decided first', async () => {
      // The account lookup lives in `deliver`, which `request` schedules with
      // `setImmediate`. Checked synchronously on the continuation of `await
      // request()` — only microtasks have run, so a `deliver` that had started
      // on the request's own turn would already show up here.
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const deliver = jest.spyOn(svc, 'deliver');
      const { outcome, delivery } = await svc.request({
        phone: known.phone,
        ipBucket: ip(),
        remoteIp: null,
        captchaToken: null,
      });
      expect(outcome).toEqual({ status: 'accepted' });
      expect(deliver).not.toHaveBeenCalled();
      await delivery;
      expect(deliver).toHaveBeenCalledTimes(1);
    });

    it('messages nobody for a staff account or a banned student — and answers them the same', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const admin = await student({ role: 'admin' });
      const banned = await student({ banned: true });

      expect(await requestAndDeliver(svc, admin.phone)).toEqual({ status: 'accepted' });
      expect(await requestAndDeliver(svc, banned.phone)).toEqual({ status: 'accepted' });
      expect(device.sent).toEqual([]);
      expect((await rows(admin.phone))[0]!.status).toBe('no_account');
    });

    it('answers the confirm step identically for a number with no code and a wrong code', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      await requestAndDeliver(svc, known.phone);
      const unknown = unknownNumber();

      const right = codeIn(device.sent[0]!.text);
      const wrong = right === '000000' ? '000001' : '000000';
      const a = await svc.confirm({ phone: known.phone, code: wrong, newPassword: 'new-password-1' });
      const b = await svc.confirm({ phone: unknown, code: wrong, newPassword: 'new-password-1' });
      expect(a).toEqual({ status: 'invalid' });
      expect(b).toEqual(a);
    });
  });

  describe('the code', () => {
    it('resets the password, signs every session out, and works once', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      await prisma.session.create({
        data: { id: randomUUID(), token: randomUUID(), userId: known.id, expiresAt: new Date(Date.now() + 86_400_000) },
      });
      await requestAndDeliver(svc, known.phone);
      const code = codeIn(device.sent[0]!.text);

      expect(await svc.confirm({ phone: known.phone, code, newPassword: 'brand-new-pass' })).toEqual({ status: 'reset' });

      const account = await prisma.account.findFirstOrThrow({ where: { userId: known.id, providerId: 'credential' } });
      expect(await argon2.verify(account.password!, 'brand-new-pass')).toBe(true);
      expect(await prisma.session.count({ where: { userId: known.id } })).toBe(0);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user:password-reset', resourceId: known.id }),
      );

      // Single use: the same right code, a second time, is just a wrong code.
      expect(await svc.confirm({ phone: known.phone, code, newPassword: 'another-pass-1' })).toEqual({ status: 'invalid' });
      const again = await prisma.account.findFirstOrThrow({ where: { userId: known.id, providerId: 'credential' } });
      expect(await argon2.verify(again.password!, 'brand-new-pass')).toBe(true);
    });

    it('lets exactly one of two simultaneous right answers through', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      await requestAndDeliver(svc, known.phone);
      const code = codeIn(device.sent[0]!.text);

      const results = await Promise.all([
        svc.confirm({ phone: known.phone, code, newPassword: 'racing-pass-a' }),
        svc.confirm({ phone: known.phone, code, newPassword: 'racing-pass-b' }),
      ]);
      expect(results.filter((r) => r.status === 'reset')).toHaveLength(1);
    });

    it('burns after five wrong guesses — the right code does not work after that', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      await requestAndDeliver(svc, known.phone);
      const code = codeIn(device.sent[0]!.text);
      const wrong = code === '999999' ? '999998' : '999999';

      for (let i = 0; i < 5; i += 1) {
        expect(await svc.confirm({ phone: known.phone, code: wrong, newPassword: 'whatever-pass' })).toEqual({ status: 'invalid' });
      }
      expect(await svc.confirm({ phone: known.phone, code, newPassword: 'whatever-pass' })).toEqual({ status: 'invalid' });
      const [row] = await rows(known.phone);
      expect(row!.status).toBe('spent');
      expect(row!.attempts).toBe(5);
    });

    it('still accepts the right code as the fifth attempt', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      await requestAndDeliver(svc, known.phone);
      const code = codeIn(device.sent[0]!.text);
      const wrong = code === '999999' ? '999998' : '999999';
      for (let i = 0; i < 4; i += 1) await svc.confirm({ phone: known.phone, code: wrong, newPassword: 'whatever-pass' });
      expect(await svc.confirm({ phone: known.phone, code, newPassword: 'fifth-time-ok' })).toEqual({ status: 'reset' });
    });

    it('expires', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      await requestAndDeliver(svc, known.phone);
      const code = codeIn(device.sent[0]!.text);
      await prisma.passwordResetRequest.updateMany({
        where: { phone: known.phone },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await svc.confirm({ phone: known.phone, code, newPassword: 'too-late-pass' })).toEqual({ status: 'invalid' });
    });

    it('is replaced by a newer code — the older one stops working', async () => {
      const device = fakeDevice();
      const svc = service(device, { limits: { resendCooldownSeconds: 0 } });
      const known = await student();
      await requestAndDeliver(svc, known.phone);
      await requestAndDeliver(svc, known.phone);
      const [first, second] = device.sent.map((s) => codeIn(s.text));

      if (first !== second) {
        expect(await svc.confirm({ phone: known.phone, code: first!, newPassword: 'old-code-pass' })).toEqual({ status: 'invalid' });
      }
      expect(await svc.confirm({ phone: known.phone, code: second!, newPassword: 'new-code-pass' })).toEqual({ status: 'reset' });
      expect((await rows(known.phone)).map((r) => r.status)).toEqual(['superseded', 'used']);
    });

    it('tells a Google-only account to use Google — only after a right code, and changes nothing', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student({ password: null, google: true });
      expect(await requestAndDeliver(svc, known.phone)).toEqual({ status: 'accepted' });
      const code = codeIn(device.sent[0]!.text);

      const wrong = code === '000000' ? '000001' : '000000';
      expect(await svc.confirm({ phone: known.phone, code: wrong, newPassword: 'google-pass-1' })).toEqual({ status: 'invalid' });
      expect(await svc.confirm({ phone: known.phone, code, newPassword: 'google-pass-1' })).toEqual({ status: 'google' });
      expect(await prisma.account.count({ where: { userId: known.id, providerId: 'credential' } })).toBe(0);
    });

    it('stores no code in clear — only a keyed hash, written once the message is out', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      await requestAndDeliver(svc, known.phone);
      const code = codeIn(device.sent[0]!.text);
      const [row] = await rows(known.phone);
      expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.codeHash).not.toContain(code);
      expect(row!.sentAt).not.toBeNull();
    });
  });

  describe('a send that does not happen leaves no valid code', () => {
    it.each([
      ['the sidecar throws', new Error('socket hang up')],
      ['WhatsApp is refusing new chats', new WhatsappRestrictedError('timelock', null)],
    ])('%s', async (_label, error) => {
      // The fake records the text BEFORE failing, so the test holds the very
      // code that would have gone out — and proves it opens nothing.
      const sent: Sent[] = [];
      const device = fakeDevice({
        send: jest.fn(async (input: Sent) => {
          sent.push(input);
          throw error;
        }),
      });
      const svc = service(device);
      const known = await student();
      expect(await requestAndDeliver(svc, known.phone)).toEqual({ status: 'accepted' });

      const [row] = await rows(known.phone);
      expect(row!.status).toBe('failed');
      expect(row!.codeHash).toBeNull();
      const code = codeIn(sent[0]!.text);
      expect(await svc.confirm({ phone: known.phone, code, newPassword: 'never-works-1' })).toEqual({ status: 'invalid' });
    });

    it('a code row that never got as far as a send cannot be marked sent with a hash', async () => {
      // The schema's own guard: the CHECK refuses a hash on a row that was not delivered.
      const number = unknownNumber();
      await expect(
        prisma.passwordResetRequest.create({
          data: { phone: number, ipBucket: ip(), status: 'failed', codeHash: 'a'.repeat(64), expiresAt: new Date() },
        }),
      ).rejects.toThrow();
    });
  });

  describe('the stack cannot send', () => {
    it.each([
      ['no device configured', { enabled: false }],
      [
        'the device is disconnected',
        { status: jest.fn(async () => ({ state: 'disconnected', limits: null })) },
      ],
      [
        'WhatsApp has timelocked new chats',
        { status: jest.fn(async () => ({ state: 'connected', limits: { restricted: true, reason: 'timelock', quotaTotal: null, quotaUsed: null } })) },
      ],
      [
        'the new-chat quota is nearly spent',
        { status: jest.fn(async () => ({ state: 'connected', limits: { restricted: false, reason: null, quotaTotal: 50, quotaUsed: 48 } })) },
      ],
    ])('%s → unavailable for everyone, and nothing is written', async (_label, overrides) => {
      const device = fakeDevice(overrides);
      const svc = service(device);
      const known = await student();
      const { outcome, delivery } = await svc.request({ phone: known.phone, ipBucket: ip(), remoteIp: null, captchaToken: null });
      expect(outcome).toEqual({ status: 'unavailable' });
      expect(delivery).toBeNull();
      expect(await rows(known.phone)).toEqual([]);
      expect(device.send).not.toHaveBeenCalled();
    });

    it('stops at the stack-wide REQUEST cap, for everyone alike', async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const already = await prisma.passwordResetRequest.count({ where: { createdAt: { gt: dayAgo } } });
      const device = fakeDevice();
      const svc = service(device, { limits: { requestsPerDay: already + 1 } });
      const first = unknownNumber();
      const known = await student();

      expect(await requestAndDeliver(svc, first)).toEqual({ status: 'accepted' });
      // A made-up number spent the slot as surely as a real one would have.
      expect(await requestAndDeliver(svc, known.phone)).toEqual({ status: 'unavailable' });
      expect(await requestAndDeliver(svc, unknownNumber())).toEqual({ status: 'unavailable' });
      expect(device.sent).toEqual([]);
    });

    it('stops SENDING at the send cap without telling anyone — no oracle at the edge', async () => {
      /*
       * The attack a visible sends cap allows: with one send left, ask for a
       * stranger's number, then for your own. If yours is refused, the
       * stranger's was registered. Here both answers stay `accepted`; the
       * second student is simply not messaged, and holds no code.
       */
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sendsSoFar = await prisma.passwordResetRequest.count({
        where: {
          status: { in: ['sending', 'sent', 'failed', 'used', 'spent', 'superseded'] },
          createdAt: { gt: dayAgo },
        },
      });
      const device = fakeDevice();
      const svc = service(device, { limits: { sendsPerDay: sendsSoFar + 1 } });
      const stranger = await student();
      const probe = await student();

      expect(await requestAndDeliver(svc, stranger.phone)).toEqual({ status: 'accepted' });
      expect(await requestAndDeliver(svc, probe.phone)).toEqual({ status: 'accepted' });
      expect(await requestAndDeliver(svc, unknownNumber())).toEqual({ status: 'accepted' });

      expect(device.sent.map((s) => s.phone)).toEqual([stranger.phone]);
      const [row] = await rows(probe.phone);
      expect(row!.status).toBe('capped');
      expect(row!.codeHash).toBeNull();
    });
  });

  describe('limits', () => {
    it('one request a minute per number — the same refusal for a made-up number', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const unknown = unknownNumber();

      await requestAndDeliver(svc, known.phone);
      await requestAndDeliver(svc, unknown);
      const a = await requestAndDeliver(svc, known.phone);
      const b = await requestAndDeliver(svc, unknown);
      expect(a).toMatchObject({ status: 'limited' });
      expect(b).toMatchObject({ status: 'limited' });
      expect((a as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
      expect((a as { retryAfterSeconds: number }).retryAfterSeconds).toBeLessThanOrEqual(60);
      expect(device.sent).toHaveLength(1);
    });

    it('three an hour per number, whoever asks', async () => {
      const device = fakeDevice();
      const svc = service(device, { limits: { resendCooldownSeconds: 0 } });
      const unknown = unknownNumber();
      for (let i = 0; i < 3; i += 1) {
        expect(await requestAndDeliver(svc, unknown, ip())).toEqual({ status: 'accepted' });
      }
      expect(await requestAndDeliver(svc, unknown, ip())).toMatchObject({ status: 'limited' });
    });

    it('five a day per number, even spread over hours', async () => {
      const device = fakeDevice();
      const svc = service(device, { limits: { resendCooldownSeconds: 0 } });
      const unknown = unknownNumber();
      for (let i = 0; i < 5; i += 1) {
        expect(await requestAndDeliver(svc, unknown, ip())).toEqual({ status: 'accepted' });
        // Age every row past the hour window so only the daily one can bite.
        await prisma.passwordResetRequest.updateMany({
          where: { phone: unknown },
          data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        });
      }
      expect(await requestAndDeliver(svc, unknown, ip())).toMatchObject({ status: 'limited' });
    });

    it('six an hour per client, across different numbers', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const from = ip();
      for (let i = 0; i < 6; i += 1) {
        expect(await requestAndDeliver(svc, unknownNumber(), from)).toEqual({ status: 'accepted' });
      }
      expect(await requestAndDeliver(svc, unknownNumber(), from)).toMatchObject({ status: 'limited' });
      // Another client is not caught by it.
      expect(await requestAndDeliver(svc, unknownNumber(), ip())).toEqual({ status: 'accepted' });
    });

    it('refuses a failed human check before anything is counted', async () => {
      const device = fakeDevice();
      const svc = service(device, { humanCheck: { verify: async () => false } });
      const known = await student();
      const { outcome } = await svc.request({ phone: known.phone, ipBucket: ip(), remoteIp: null, captchaToken: 'bad' });
      expect(outcome).toEqual({ status: 'human_check' });
      expect(await rows(known.phone)).toEqual([]);
    });
  });
});
