// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { cairoDayKey } from '../analytics/analytics-shared';
import { CentersService } from './centers.service';

/**
 * «السناتر» against the real database — every test states the rule it proves
 * in the owner's words: a day with no scan is a day off, a booked student who
 * did not come is absent, a card read twice is one attendance, a full slot
 * takes nobody new.
 */
describe('CentersService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const centers = new CentersService(prisma, new AuditService(prisma));
  const users: string[] = [];
  const centerIds: string[] = [];
  let adminId = '';
  let governorateCode = '';

  beforeAll(async () => {
    await prisma.$connect();
    governorateCode = (await prisma.governorate.findFirstOrThrow()).code;
    adminId = `ctr-admin-${Date.now()}`;
    await prisma.user.create({ data: { id: adminId, name: 'أدمن', email: `${adminId}@t.test`, role: 'admin' } });
    users.push(adminId);
  });

  afterAll(async () => {
    await prisma.center.deleteMany({ where: { id: { in: centerIds } } });
    await prisma.studentProfile.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  async function student(name = 'طالب'): Promise<{ userId: string; studentNumber: number }> {
    const id = `ctr-stu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const phone = `+2010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    await prisma.user.create({ data: { id, name, email: `${id}@t.test`, role: 'student', phoneNumber: phone } });
    users.push(id);
    const profile = await prisma.studentProfile.create({
      data: { userId: id, fullName: name, gender: 'male', phone, governorateCode, year: 2 },
      select: { studentNumber: true },
    });
    return { userId: id, studentNumber: profile.studentNumber };
  }

  async function slot(overrides: { capacity?: number; priceCents?: number; year?: number | null } = {}) {
    const center = await prisma.center.create({ data: { name: `سنتر ${Math.random().toString(36).slice(2, 6)}` } });
    centerIds.push(center.id);
    return prisma.centerSlot.create({
      data: {
        centerId: center.id,
        dayOfWeek: 6,
        startMinute: 840,
        endMinute: 960,
        capacity: overrides.capacity ?? null,
        priceCents: overrides.priceCents ?? 5000,
        year: overrides.year ?? null,
      },
    });
  }

  const book = (userId: string, slotId: string | null, force = false) =>
    prisma.$transaction((tx) => centers.setBookingTx(tx, userId, slotId, { year: 2, force }));

  it('a student numbers are unique and short', async () => {
    const a = await student();
    const b = await student();
    expect(a.studentNumber).not.toBe(b.studentNumber);
    expect(a.studentNumber).toBeGreaterThan(1000);
  });

  it('one live booking per student; moving cancels the old one', async () => {
    const s1 = await slot();
    const s2 = await slot();
    const { userId } = await student();
    await book(userId, s1.id);
    await book(userId, s2.id);
    const rows = await prisma.centerBooking.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((row) => [row.slotId, row.status])).toEqual([
      [s1.id, 'cancelled'],
      [s2.id, 'active'],
    ]);
  });

  it('a full slot takes nobody new — capacity or the admin\'s «فل» — but the admin can override', async () => {
    const small = await slot({ capacity: 1 });
    const [a, b] = [await student(), await student()];
    await book(a.userId, small.id);
    await expect(book(b.userId, small.id)).rejects.toBeInstanceOf(ConflictException);
    await book(b.userId, small.id, true);
    expect(await prisma.centerBooking.count({ where: { slotId: small.id, status: 'active' } })).toBe(2);

    const closed = await slot();
    await prisma.centerSlot.update({ where: { id: closed.id }, data: { isFull: true } });
    const c = await student();
    await expect(book(c.userId, closed.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('the list offers only active centres with slots for the student\'s year', async () => {
    const forYear1 = await slot({ year: 1 });
    const forAll = await slot();
    const list = await centers.listPublic(2);
    const ids = list.centers.flatMap((center) => center.slots.map((s) => s.id));
    expect(ids).toContain(forAll.id);
    expect(ids).not.toContain(forYear1.id);
  });

  it('the door: a card read twice is one attendance, a stranger is recorded and flagged, a bad code is refused', async () => {
    const s = await slot({ priceCents: 7500 });
    const booked = await student('محجوز');
    const walkIn = await student('ضيف');
    await book(booked.userId, s.id);

    const first = await centers.scan(adminId, { slotId: s.id, code: `ST${booked.studentNumber}` });
    expect(first).toMatchObject({ outcome: 'recorded', notBookedHere: false, presentCount: 1 });
    const again = await centers.scan(adminId, { slotId: s.id, code: String(booked.studentNumber) });
    expect(again).toMatchObject({ outcome: 'already', presentCount: 1, recordId: first.recordId });

    const guest = await centers.scan(adminId, { slotId: s.id, code: `ST${walkIn.studentNumber}` });
    expect(guest).toMatchObject({ outcome: 'recorded', notBookedHere: true, presentCount: 2 });

    await expect(centers.scan(adminId, { slotId: s.id, code: 'https://chat.whatsapp.com/x' })).rejects.toThrow();
    await expect(centers.scan(adminId, { slotId: s.id, code: 'ST99999999' })).rejects.toBeInstanceOf(NotFoundException);

    const record = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: first.recordId } });
    expect(record.feeCents).toBe(7500);
  });

  it('the sheet: absent only on days a class was held; a day with no scan is a day off', async () => {
    const s = await slot();
    const came = await student('جه');
    const missed = await student('غاب');
    // Booked well before the classes below.
    await book(came.userId, s.id);
    await book(missed.userId, s.id);
    await prisma.centerBooking.updateMany({
      where: { slotId: s.id },
      data: { createdAt: new Date('2026-01-01T10:00:00Z') },
    });

    await centers.scan(adminId, { slotId: s.id, code: `ST${came.studentNumber}`, date: '2026-09-05' });
    await centers.scan(adminId, { slotId: s.id, code: `ST${came.studentNumber}`, date: '2026-09-19' });
    // 2026-09-12: nobody scanned — a day off.

    const sheet = await centers.sheet(s.id, '2026-09-01', '2026-09-30');
    expect(sheet.sessions.map((session) => session.date)).toEqual(['2026-09-05', '2026-09-19']);
    const byName = Object.fromEntries(sheet.rows.map((row) => [row.fullName, row]));
    expect(byName['جه']).toMatchObject({ cells: ['present', 'present'], attended: 2, absent: 0 });
    expect(byName['غاب']).toMatchObject({ cells: ['absent', 'absent'], attended: 0, absent: 2 });

    const history = await centers.studentAttendance(missed.userId);
    expect(history).toMatchObject({ attended: 0, absent: 2 });
  });

  it('a student who booked after a class is not absent from it', async () => {
    const s = await slot();
    const early = await student('بدري');
    const late = await student('متأخر');
    await book(early.userId, s.id);
    await prisma.centerBooking.updateMany({ where: { slotId: s.id }, data: { createdAt: new Date('2026-01-01T10:00:00Z') } });
    await centers.scan(adminId, { slotId: s.id, code: `ST${early.studentNumber}`, date: '2026-02-07' });
    await book(late.userId, s.id);

    const sheet = await centers.sheet(s.id, '2026-02-01', '2026-02-28');
    const lateRow = sheet.rows.find((row) => row.userId === late.userId)!;
    expect(lateRow.cells).toEqual(['not_booked']);
    expect(lateRow.absent).toBe(0);
  });

  it('undoing the last read of a day removes the class itself', async () => {
    const s = await slot();
    const one = await student();
    const today = cairoDayKey(new Date());
    const read = await centers.scan(adminId, { slotId: s.id, code: `ST${one.studentNumber}` });
    expect(await prisma.attendanceSession.count({ where: { slotId: s.id } })).toBe(1);
    await centers.removeRecord(adminId, read.recordId);
    expect(await prisma.attendanceSession.count({ where: { slotId: s.id, date: new Date(`${today}T00:00:00Z`) } })).toBe(0);
  });

  it('the money: every attendance carries the price it was taken at', async () => {
    const s = await slot({ priceCents: 10000 });
    const [a, b] = [await student(), await student()];
    await centers.scan(adminId, { slotId: s.id, code: `ST${a.studentNumber}`, date: '2026-03-07' });
    await prisma.centerSlot.update({ where: { id: s.id }, data: { priceCents: 12000 } });
    await centers.scan(adminId, { slotId: s.id, code: `ST${b.studentNumber}`, date: '2026-03-07' });

    const march = await centers.finance('2026-03');
    const center = march.byCenter.find((row) => row.bySlot.some((entry) => entry.slotId === s.id))!;
    expect(center).toMatchObject({ totalCents: 22000, attendances: 2 });
  });

  it('a centre with history cannot be deleted — only switched off', async () => {
    const s = await slot();
    const one = await student();
    await book(one.userId, s.id);
    await expect(centers.deleteCenter(adminId, s.centerId)).rejects.toBeInstanceOf(ConflictException);
    await expect(centers.deleteSlot(adminId, s.id)).rejects.toBeInstanceOf(ConflictException);
  });
});
