import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaActiveDeviceLookup } from '../auth/device-limit';
import { PrismaClient } from '../generated/prisma/client';
import { StudentsService } from '../modules/admin/students/students.service';
import { SessionDeviceService } from '../modules/sessions/session-device.service';

/**
 * «سجّل خروج» و«مسموح له بكام جهاز» من صفحة الطالب — against the real tables.
 *
 * ## Why an integration test
 *
 * The property that matters is the one between two tables and a query: after
 * the operator presses «سجّل خروج», the gate (`PrismaActiveDeviceLookup`) must
 * stop counting that device. That is `session_devices` stamped, `sessions`
 * deleted and a raw JOIN agreeing — a mocked Prisma would be asserting the
 * mock. Same reasoning as `set-password-escalation.int-spec.ts`, whose shape
 * this follows.
 *
 * The audit log is stubbed: what is recorded is asserted in
 * `students.service.spec.ts`, and the local chain is broken beyond repair.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const audit = { record: async () => undefined };
const sessionDevices = new SessionDeviceService(prisma);
const service = new StudentsService(prisma as never, audit as never, sessionDevices);
const gateLookup = new PrismaActiveDeviceLookup(prisma);

const created: string[] = [];

async function makeUser(role: 'admin' | 'owner' | 'student'): Promise<string> {
  const id = randomUUID();
  await prisma.user.create({
    data: { id, name: `devices-probe-${role}`, email: `${id}@devices.invalid`, role },
  });
  created.push(id);
  return id;
}

/** A live Better Auth session and the device row `recordLogin` would write for it. */
async function signIn(userId: string, deviceName: string): Promise<{ sessionId: string; deviceId: string }> {
  const sessionId = randomUUID();
  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const now = new Date();
  const device = await prisma.sessionDevice.create({
    data: { userId, sessionId, deviceName, deviceType: 'mobile', lastSeenAt: now, loggedInAt: now },
  });
  return { sessionId, deviceId: device.id };
}

afterAll(async () => {
  // `session`/`sessionDevice` cascade from the user.
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('admin «سجّل خروج» frees the slot the gate counts', () => {
  it('signs out every sign-in from the device, and the gate stops counting it', async () => {
    const student = await makeUser('student');
    // Two sign-ins from the same phone are one device — and both must end.
    const first = await signIn(student, 'Chrome على Android');
    const second = await signIn(student, 'Chrome على Android');
    await signIn(student, 'Safari على iOS');
    const actor = await makeUser('admin');

    await service.revokeDevice(student, second.deviceId, actor);

    expect(await prisma.session.count({ where: { id: { in: [first.sessionId, second.sessionId] } } })).toBe(0);
    expect((await gateLookup.activeDeviceNames(student)).sort()).toEqual(['Safari على iOS']);
    expect((await sessionDevices.listFor(student)).map((d) => d.deviceName)).toEqual(['Safari على iOS']);
  });

  it('404s another account\'s device id and leaves that account signed in', async () => {
    const owner = await makeUser('student');
    const victim = await makeUser('student');
    const victimDevice = await signIn(victim, 'Chrome على Android');
    const actor = await makeUser('admin');

    await expect(service.revokeDevice(owner, victimDevice.deviceId, actor)).rejects.toThrow(NotFoundException);
    expect(await prisma.session.count({ where: { id: victimDevice.sessionId } })).toBe(1);
    expect(await gateLookup.activeDeviceNames(victim)).toEqual(['Chrome على Android']);
  });

  it('«كل الأجهزة» ends every session — including one with no device row behind it', async () => {
    const student = await makeUser('student');
    await signIn(student, 'Chrome على Android');
    await signIn(student, 'Safari على iOS');
    // `recordLogin` is best-effort: a session whose device row was never
    // written is invisible on the card and must still end.
    await prisma.session.create({
      data: { id: randomUUID(), userId: student, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const actor = await makeUser('admin');

    await service.revokeAllDevices(student, actor);

    expect(await prisma.session.count({ where: { userId: student } })).toBe(0);
    expect(await gateLookup.activeDeviceNames(student)).toEqual([]);
    // Stamped, not erased — the sign-in log survives, as it does for `revokeOwn`.
    expect(await prisma.sessionDevice.count({ where: { userId: student, revokedAt: { not: null } } })).toBe(2);
  });

  it('refuses an assistant signing an admin out, and signs nobody out', async () => {
    const admin = await makeUser('admin');
    const device = await signIn(admin, 'Chrome على Windows');
    const assistant = await makeUser('owner');

    await expect(service.revokeDevice(admin, device.deviceId, assistant)).rejects.toThrow(ForbiddenException);
    await expect(service.revokeAllDevices(admin, assistant)).rejects.toThrow(ForbiddenException);
    expect(await prisma.session.count({ where: { userId: admin } })).toBe(1);
  });
});

describe('the per-account limit is the one the gate reads', () => {
  it('stores an override, reads it back through the gate\'s own lookup, and clears it', async () => {
    const student = await makeUser('student');
    const actor = await makeUser('admin');

    expect(await gateLookup.maxDevicesFor(student)).toBeNull();

    await service.setDeviceLimit(student, { maxDevices: 4 }, actor);
    expect(await gateLookup.maxDevicesFor(student)).toBe(4);
    expect((await prisma.user.findUnique({ where: { id: student }, select: { maxDevices: true } }))?.maxDevices).toBe(4);

    await service.setDeviceLimit(student, { maxDevices: null }, actor);
    expect(await gateLookup.maxDevicesFor(student)).toBeNull();
  });

  /**
   * The schema refuses first, but the column's own CHECK is what holds when
   * something writes it without the schema — a script, a console, a future
   * route.
   */
  it('refuses 0 and 11 in the table itself', async () => {
    const student = await makeUser('student');

    await expect(prisma.user.update({ where: { id: student }, data: { maxDevices: 0 } })).rejects.toThrow();
    await expect(prisma.user.update({ where: { id: student }, data: { maxDevices: 11 } })).rejects.toThrow();
  });

  it('refuses an assistant pinning an admin to one device, and writes nothing', async () => {
    const admin = await makeUser('admin');
    const assistant = await makeUser('owner');

    await expect(service.setDeviceLimit(admin, { maxDevices: 1 }, assistant)).rejects.toThrow(ForbiddenException);
    expect(await gateLookup.maxDevicesFor(admin)).toBeNull();
  });
});
