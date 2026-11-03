import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappRestrictedError } from '../marketing/whatsapp-device.service';
import { generateHandle } from './password-reset-code';
import { PasswordResetService, type PasswordResetOptions, type RequestOutcome } from './password-reset.service';

/**
 * «نسيت كلمة السر» against the real database.
 *
 * Integration, not unit, because every property that matters here is a
 * property of SQL: the limits are counts over the table, the attempt caps and
 * single use are conditional `UPDATE`s racing each other, and the "no code
 * until delivered" rule is a CHECK constraint. A mocked Prisma would be
 * asserting the mock.
 *
 * The WhatsApp device and Turnstile are the fakes: nothing in this file
 * reaches a socket. Every number and client address is random per test, so
 * the shared local database's leftovers cannot trip a per-number or
 * per-client limit; the stack-wide caps are lifted out of the way except in
 * the tests about them.
 */

const SECRET = 'password-reset-int-spec-secret-0123456789';
const OPEN: PasswordResetOptions['limits'] = {
  requestsPerHour: 1_000_000,
  requestsPerDay: 1_000_000,
  sendsPerHour: 1_000_000,
  newChatSendsPerDay: 1_000_000,
};
const DAY_MS = 24 * 60 * 60 * 1000;
const PASS = { verify: async () => true };

function phone(): string {
  return `+2010${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
}
function ip(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(0, 256)}`;
}
function codeIn(text: string): string {
  return /\b(\d{6})\b/u.exec(text)![1]!;
}
function other(code: string): string {
  return code === '999999' ? '999998' : '999999';
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
    // A fully warmed number by default, so the derived budget never bites
    // except in the test about it.
    dailyCeiling: jest.fn(async () => ({ limit: 10_000_000, usedToday: 0 })),
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
      humanCheck: PASS,
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

  async function ask(svc: PasswordResetService, number: string, from = ip()): Promise<RequestOutcome> {
    const { outcome, delivery } = await svc.request({ phone: number, ipBucket: from, remoteIp: from, captchaToken: 'tok' });
    await delivery;
    return outcome;
  }

  function handleOf(outcome: RequestOutcome): string {
    if (outcome.status !== 'accepted') throw new Error(`expected accepted, got ${outcome.status}`);
    return outcome.handle;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.passwordResetRequest.deleteMany({ where: { phone: { in: phones } } });
    await prisma.waChat.deleteMany({ where: { phone: { in: phones } } });
    await prisma.waHistoryChat.deleteMany({ where: { phone: { in: phones } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.account.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  describe('no enumeration', () => {
    it('answers a registered student and a made-up number with the same shape, and messages only the student', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const unknown = unknownNumber();

      const a = await ask(svc, known.phone);
      const b = await ask(svc, unknown);

      expect(a).toEqual({ status: 'accepted', handle: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
      expect(b).toEqual({ status: 'accepted', handle: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
      expect(handleOf(a)).not.toBe(handleOf(b));
      expect(device.sent.map((s) => s.phone)).toEqual([known.phone]);
      expect(device.sent[0]!.source).toBe('otp');
      // Both requests have a row with a handle — the made-up number's too.
      const [unknownRow] = await rows(unknown);
      expect(unknownRow!.status).toBe('no_account');
      expect(unknownRow!.handleHash).toMatch(/^[0-9a-f]{64}$/);
      expect((await rows(known.phone)).map((r) => r.status)).toEqual(['sent']);
    });

    it('does not answer after the account is looked up — the response is decided first', async () => {
      // The lookup lives in `deliver`, which `request` schedules with
      // `setImmediate`. Checked synchronously on the continuation of `await
      // request()` — only microtasks have run.
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const deliver = jest.spyOn(svc, 'deliver');
      const { outcome, delivery } = await svc.request({ phone: known.phone, ipBucket: ip(), remoteIp: null, captchaToken: 'tok' });
      expect(outcome.status).toBe('accepted');
      expect(deliver).not.toHaveBeenCalled();
      await delivery;
      expect(deliver).toHaveBeenCalledTimes(1);
    });

    it('messages nobody for a staff account or a banned student — and answers them the same', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const admin = await student({ role: 'admin' });
      const banned = await student({ banned: true });

      expect((await ask(svc, admin.phone)).status).toBe('accepted');
      expect((await ask(svc, banned.phone)).status).toBe('accepted');
      expect(device.sent).toEqual([]);
      expect((await rows(admin.phone))[0]!.status).toBe('no_account');
    });

    it('answers the confirm step identically for a made-up number and a wrong code', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const knownHandle = handleOf(await ask(svc, known.phone));
      const unknown = unknownNumber();
      const unknownHandle = handleOf(await ask(svc, unknown));

      const wrong = other(codeIn(device.sent[0]!.text));
      const a = await svc.confirm({ phone: known.phone, handle: knownHandle, code: wrong, newPassword: 'new-password-1' });
      const b = await svc.confirm({ phone: unknown, handle: unknownHandle, code: wrong, newPassword: 'new-password-1' });
      expect(a).toEqual({ status: 'invalid' });
      expect(b).toEqual(a);
    });
  });

  describe('the handle binds a code to whoever asked for it', () => {
    it('a stranger cannot burn a student’s live code — not with a made-up handle, not with their own', async () => {
      const device = fakeDevice();
      const svc = service(device, { limits: { resendCooldownSeconds: 0 } });
      const known = await student();
      const mine = handleOf(await ask(svc, known.phone));
      const myCode = codeIn(device.sent[0]!.text);

      // A stranger with handles they invented: no row is touched.
      for (let i = 0; i < 6; i += 1) {
        await svc.confirm({ phone: known.phone, handle: generateHandle(), code: other(myCode), newPassword: 'stranger-pw' });
      }
      // A stranger with a handle of their OWN for the same number: the guesses
      // land on their row, whose code went to the student's phone, not mine.
      const theirs = handleOf(await ask(svc, known.phone));
      for (let i = 0; i < 4; i += 1) {
        await svc.confirm({ phone: known.phone, handle: theirs, code: other(myCode), newPassword: 'stranger-pw' });
      }
      const [myRow] = await rows(known.phone);
      expect(myRow!.attempts).toBe(0);

      expect(await svc.confirm({ phone: known.phone, handle: mine, code: myCode, newPassword: 'still-mine-1' })).toEqual({ status: 'reset' });
    });

    it('a right code with the wrong handle is just a wrong code', async () => {
      const device = fakeDevice();
      const svc = service(device, { limits: { resendCooldownSeconds: 0 } });
      const known = await student();
      const first = handleOf(await ask(svc, known.phone));
      const second = handleOf(await ask(svc, known.phone));
      const [firstCode, secondCode] = device.sent.map((s) => codeIn(s.text));

      if (firstCode !== secondCode) {
        expect(await svc.confirm({ phone: known.phone, handle: first, code: secondCode!, newPassword: 'crossed-pw-1' })).toEqual({ status: 'invalid' });
      }
      expect(await svc.confirm({ phone: known.phone, handle: second, code: secondCode!, newPassword: 'right-pair-1' })).toEqual({ status: 'reset' });
    });

    it('a handle for one number opens nothing on another', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const a = await student();
      const b = await student();
      const handleA = handleOf(await ask(svc, a.phone));
      await ask(svc, b.phone);
      const codeB = codeIn(device.sent[1]!.text);
      expect(await svc.confirm({ phone: b.phone, handle: handleA, code: codeB, newPassword: 'cross-number-1' })).toEqual({ status: 'invalid' });
    });
  });

  describe('the code', () => {
    it('resets the password, signs every session out, and works once', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      await prisma.session.create({
        data: { id: randomUUID(), token: randomUUID(), userId: known.id, expiresAt: new Date(Date.now() + DAY_MS) },
      });
      const handle = handleOf(await ask(svc, known.phone));
      const code = codeIn(device.sent[0]!.text);

      expect(await svc.confirm({ phone: known.phone, handle, code, newPassword: 'brand-new-pass' })).toEqual({ status: 'reset' });

      const account = await prisma.account.findFirstOrThrow({ where: { userId: known.id, providerId: 'credential' } });
      expect(await argon2.verify(account.password!, 'brand-new-pass')).toBe(true);
      expect(await prisma.session.count({ where: { userId: known.id } })).toBe(0);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'user:password-reset', resourceId: known.id }));

      // Single use: the same right code, a second time, is just a wrong code.
      expect(await svc.confirm({ phone: known.phone, handle, code, newPassword: 'another-pass-1' })).toEqual({ status: 'invalid' });
      const again = await prisma.account.findFirstOrThrow({ where: { userId: known.id, providerId: 'credential' } });
      expect(await argon2.verify(again.password!, 'brand-new-pass')).toBe(true);
    });

    it('lets exactly one of two simultaneous right answers through', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const handle = handleOf(await ask(svc, known.phone));
      const code = codeIn(device.sent[0]!.text);

      const results = await Promise.all([
        svc.confirm({ phone: known.phone, handle, code, newPassword: 'racing-pass-a' }),
        svc.confirm({ phone: known.phone, handle, code, newPassword: 'racing-pass-b' }),
      ]);
      expect(results.filter((r) => r.status === 'reset')).toHaveLength(1);
    });

    it('burns after five wrong guesses — the right code does not work after that', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const handle = handleOf(await ask(svc, known.phone));
      const code = codeIn(device.sent[0]!.text);

      for (let i = 0; i < 5; i += 1) {
        expect(await svc.confirm({ phone: known.phone, handle, code: other(code), newPassword: 'whatever-pass' })).toEqual({ status: 'invalid' });
      }
      expect(await svc.confirm({ phone: known.phone, handle, code, newPassword: 'whatever-pass' })).toEqual({ status: 'invalid' });
      const [row] = await rows(known.phone);
      expect(row!.status).toBe('spent');
      expect(row!.attempts).toBe(5);
    });

    it('still accepts the right code as the fifth attempt', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const handle = handleOf(await ask(svc, known.phone));
      const code = codeIn(device.sent[0]!.text);
      for (let i = 0; i < 4; i += 1) await svc.confirm({ phone: known.phone, handle, code: other(code), newPassword: 'whatever-pass' });
      expect(await svc.confirm({ phone: known.phone, handle, code, newPassword: 'fifth-time-ok' })).toEqual({ status: 'reset' });
    });

    it('stops a number after ten wrong guesses in a day, across codes', async () => {
      const device = fakeDevice();
      const svc = service(device, { limits: { resendCooldownSeconds: 0 } });
      const known = await student();
      const h1 = handleOf(await ask(svc, known.phone));
      const h2 = handleOf(await ask(svc, known.phone));
      const h3 = handleOf(await ask(svc, known.phone));
      const [c1, c2, c3] = device.sent.map((s) => codeIn(s.text));

      for (let i = 0; i < 5; i += 1) await svc.confirm({ phone: known.phone, handle: h1, code: other(c1!), newPassword: 'whatever-pass' });
      for (let i = 0; i < 5; i += 1) await svc.confirm({ phone: known.phone, handle: h2, code: other(c2!), newPassword: 'whatever-pass' });
      // The third code is fresh and right — and still refused, with the same answer.
      expect(await svc.confirm({ phone: known.phone, handle: h3, code: c3!, newPassword: 'eleventh-pw-1' })).toEqual({ status: 'invalid' });
      const third = (await rows(known.phone))[2]!;
      expect(third.status).toBe('sent');
      expect(third.attempts).toBe(0);
    });

    it('expires', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const handle = handleOf(await ask(svc, known.phone));
      const code = codeIn(device.sent[0]!.text);
      await prisma.passwordResetRequest.updateMany({ where: { phone: known.phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await svc.confirm({ phone: known.phone, handle, code, newPassword: 'too-late-pass' })).toEqual({ status: 'invalid' });
    });

    it('tells a Google-only account to use Google — only after a right code, and changes nothing', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student({ password: null, google: true });
      const handle = handleOf(await ask(svc, known.phone));
      const code = codeIn(device.sent[0]!.text);

      expect(await svc.confirm({ phone: known.phone, handle, code: other(code), newPassword: 'google-pass-1' })).toEqual({ status: 'invalid' });
      expect(await svc.confirm({ phone: known.phone, handle, code, newPassword: 'google-pass-1' })).toEqual({ status: 'google' });
      expect(await prisma.account.count({ where: { userId: known.id, providerId: 'credential' } })).toBe(0);
    });

    it('stores no code and no handle in clear', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const handle = handleOf(await ask(svc, known.phone));
      const code = codeIn(device.sent[0]!.text);
      const [row] = await rows(known.phone);
      expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.codeHash).not.toContain(code);
      expect(row!.handleHash).not.toContain(handle);
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
      const handle = handleOf(await ask(svc, known.phone));

      const [row] = await rows(known.phone);
      expect(row!.status).toBe('failed');
      expect(row!.codeHash).toBeNull();
      const code = codeIn(sent[0]!.text);
      expect(await svc.confirm({ phone: known.phone, handle, code, newPassword: 'never-works-1' })).toEqual({ status: 'invalid' });
    });

    it('a row that was never delivered cannot carry a hash — the schema refuses it', async () => {
      const number = unknownNumber();
      await expect(
        prisma.passwordResetRequest.create({
          data: { phone: number, ipBucket: ip(), handleHash: 'b'.repeat(64), status: 'failed', codeHash: 'a'.repeat(64), expiresAt: new Date() },
        }),
      ).rejects.toThrow();
    });
  });

  describe('the stack cannot send', () => {
    it.each([
      ['no device configured', { enabled: false }],
      ['the device is disconnected', { status: jest.fn(async () => ({ state: 'disconnected', limits: null })) }],
      [
        'WhatsApp has timelocked new chats',
        { status: jest.fn(async () => ({ state: 'connected', limits: { restricted: true, reason: 'timelock', quotaTotal: null, quotaUsed: null } })) },
      ],
      [
        'ten or fewer of WhatsApp’s new chats are left',
        { status: jest.fn(async () => ({ state: 'connected', limits: { restricted: false, reason: null, quotaTotal: 50, quotaUsed: 40 } })) },
      ],
    ])('%s → unavailable for everyone, and nothing is written', async (_label, overrides) => {
      const device = fakeDevice(overrides);
      const svc = service(device);
      const known = await student();
      const { outcome, delivery } = await svc.request({ phone: known.phone, ipBucket: ip(), remoteIp: null, captchaToken: 'tok' });
      expect(outcome).toEqual({ status: 'unavailable' });
      expect(delivery).toBeNull();
      expect(await rows(known.phone)).toEqual([]);
      expect(device.send).not.toHaveBeenCalled();
    });

    it('sends with eleven new chats left — the reserve is ten', async () => {
      const device = fakeDevice({
        status: jest.fn(async () => ({ state: 'connected', limits: { restricted: false, reason: null, quotaTotal: 50, quotaUsed: 39 } })),
      });
      const svc = service(device);
      const known = await student();
      expect((await ask(svc, known.phone)).status).toBe('accepted');
      expect(device.sent).toHaveLength(1);
    });

    it('fails closed with no Turnstile on the stack — unavailable for everyone, nothing written', async () => {
      const device = fakeDevice();
      const svc = service(device, { humanCheck: null });
      const known = await student();
      const { outcome, delivery } = await svc.request({ phone: known.phone, ipBucket: ip(), remoteIp: null, captchaToken: null });
      expect(outcome).toEqual({ status: 'unavailable' });
      expect(delivery).toBeNull();
      expect(await rows(known.phone)).toEqual([]);
      expect(device.status).not.toHaveBeenCalled();
    });

    it('stops at the stack-wide REQUEST cap, for everyone alike', async () => {
      const already = await prisma.passwordResetRequest.count({ where: { createdAt: { gt: new Date(Date.now() - DAY_MS) } } });
      const device = fakeDevice();
      const svc = service(device, { limits: { requestsPerDay: already + 1 } });
      const known = await student();

      expect((await ask(svc, unknownNumber())).status).toBe('accepted');
      // A made-up number spent the slot as surely as a real one would have.
      expect(await ask(svc, known.phone)).toEqual({ status: 'unavailable' });
      expect(await ask(svc, unknownNumber())).toEqual({ status: 'unavailable' });
      expect(device.sent).toEqual([]);
    });
  });

  describe('the number’s budget — enforced where nobody can watch', () => {
    const SENT_STATUSES = ['sending', 'sent', 'failed', 'used', 'spent', 'superseded'];

    it('sends at most a fifth of the device’s current daily ceiling, and says `accepted` past it', async () => {
      /*
       * Also the oracle test: with one send left, a stranger's number and then
       * the attacker's own. Both stay `accepted`; the second student is simply
       * not messaged and holds no code.
       */
      const sendsSoFar = await prisma.passwordResetRequest.count({
        where: { status: { in: SENT_STATUSES }, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      // floor(limit × 0.2) === sendsSoFar + 1 — one slot left.
      const device = fakeDevice({ dailyCeiling: jest.fn(async () => ({ limit: (sendsSoFar + 1) * 5, usedToday: 0 })) });
      const svc = service(device);
      const stranger = await student();
      const probe = await student();

      expect((await ask(svc, stranger.phone)).status).toBe('accepted');
      expect((await ask(svc, probe.phone)).status).toBe('accepted');
      expect((await ask(svc, unknownNumber())).status).toBe('accepted');

      expect(device.sent.map((s) => s.phone)).toEqual([stranger.phone]);
      const [row] = await rows(probe.phone);
      expect(row!.status).toBe('capped');
      expect(row!.codeHash).toBeNull();
    });

    it('derives the budget from the ceiling, so a warming number gives codes less', async () => {
      const sendsSoFar = await prisma.passwordResetRequest.count({
        where: { status: { in: SENT_STATUSES }, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      // A ceiling whose fifth is already spent: nothing goes out.
      const device = fakeDevice({ dailyCeiling: jest.fn(async () => ({ limit: Math.max(1, sendsSoFar) * 5, usedToday: 0 })) });
      const svc = service(device);
      const known = await student();
      expect((await ask(svc, known.phone)).status).toBe('accepted');
      expect(device.sent).toEqual([]);
      expect((await rows(known.phone))[0]!.status).toBe('capped');
    });

    it('caps codes to numbers with NO chat yet — a number that already chatted still gets one', async () => {
      const newChatsSoFar = await prisma.passwordResetRequest.count({
        where: { status: { in: SENT_STATUSES }, newChat: true, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
      });
      const device = fakeDevice();
      const svc = service(device, { limits: { newChatSendsPerDay: newChatsSoFar + 1 } });
      const first = await student();
      const second = await student();
      const inInbox = await student();
      const inHistory = await student();
      await prisma.waChat.create({ data: { phone: inInbox.phone, firstMessage: 'سلام', lastMessage: 'سلام' } });
      await prisma.waHistoryChat.create({ data: { phone: inHistory.phone, hasChat: true } });

      await ask(svc, first.phone);
      await ask(svc, second.phone);
      await ask(svc, inInbox.phone);
      await ask(svc, inHistory.phone);

      expect(device.sent.map((s) => s.phone)).toEqual([first.phone, inInbox.phone, inHistory.phone]);
      expect((await rows(first.phone))[0]!.newChat).toBe(true);
      expect((await rows(second.phone))[0]!.status).toBe('capped');
      expect((await rows(inInbox.phone))[0]!.newChat).toBe(false);
    });
  });

  describe('limits', () => {
    it('one request a minute per number — the same refusal for a made-up number', async () => {
      const device = fakeDevice();
      const svc = service(device);
      const known = await student();
      const unknown = unknownNumber();

      await ask(svc, known.phone);
      await ask(svc, unknown);
      const a = await ask(svc, known.phone);
      const b = await ask(svc, unknown);
      expect(a).toMatchObject({ status: 'limited' });
      expect(b).toMatchObject({ status: 'limited' });
      expect((a as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
      expect((a as { retryAfterSeconds: number }).retryAfterSeconds).toBeLessThanOrEqual(60);
      expect(device.sent).toHaveLength(1);
    });

    it('three an hour per number, whoever asks', async () => {
      const svc = service(fakeDevice(), { limits: { resendCooldownSeconds: 0 } });
      const unknown = unknownNumber();
      for (let i = 0; i < 3; i += 1) expect((await ask(svc, unknown, ip())).status).toBe('accepted');
      expect(await ask(svc, unknown, ip())).toMatchObject({ status: 'limited' });
    });

    it('five a day per number, even spread over hours', async () => {
      const svc = service(fakeDevice(), { limits: { resendCooldownSeconds: 0 } });
      const unknown = unknownNumber();
      for (let i = 0; i < 5; i += 1) {
        expect((await ask(svc, unknown, ip())).status).toBe('accepted');
        // Age every row past the hour window so only the daily one can bite.
        await prisma.passwordResetRequest.updateMany({
          where: { phone: unknown },
          data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        });
      }
      expect(await ask(svc, unknown, ip())).toMatchObject({ status: 'limited' });
    });

    it('six an hour per client, across different numbers', async () => {
      const svc = service(fakeDevice());
      const from = ip();
      for (let i = 0; i < 6; i += 1) expect((await ask(svc, unknownNumber(), from)).status).toBe('accepted');
      expect(await ask(svc, unknownNumber(), from)).toMatchObject({ status: 'limited' });
      // Another client is not caught by it.
      expect((await ask(svc, unknownNumber(), ip())).status).toBe('accepted');
    });

    it('refuses a failed human check before anything is counted', async () => {
      const svc = service(fakeDevice(), { humanCheck: { verify: async () => false } });
      const known = await student();
      const { outcome } = await svc.request({ phone: known.phone, ipBucket: ip(), remoteIp: null, captchaToken: 'bad' });
      expect(outcome).toEqual({ status: 'human_check' });
      expect(await rows(known.phone)).toEqual([]);
    });
  });

  describe('prune', () => {
    it('deletes rows older than thirty days and keeps the rest', async () => {
      const old = unknownNumber();
      const fresh = unknownNumber();
      await prisma.passwordResetRequest.createMany({
        data: [
          { phone: old, ipBucket: ip(), handleHash: 'c'.repeat(64), status: 'no_account', expiresAt: new Date(), createdAt: new Date(Date.now() - 31 * DAY_MS) },
          { phone: fresh, ipBucket: ip(), handleHash: 'd'.repeat(64), status: 'no_account', expiresAt: new Date(), createdAt: new Date(Date.now() - 29 * DAY_MS) },
        ],
      });
      const svc = service(fakeDevice());
      expect(await svc.prune()).toBeGreaterThanOrEqual(1);
      expect(await rows(old)).toEqual([]);
      expect(await rows(fresh)).toHaveLength(1);
    });
  });
});
