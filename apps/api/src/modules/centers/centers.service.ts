import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminCenterPatchInput,
  AdminCenterWriteInput,
  AdminCenters,
  AdminSlot,
  AdminSlotBookings,
  AdminSlotPatchInput,
  AdminSlotWriteInput,
  AttendanceScanInput,
  AttendanceScanResult,
  AttendanceSheet,
  CenterFinance,
  StudentAttendance,
} from '@ayman/contracts/admin/centers';
import {
  formatSlotTime,
  studentNumberFromCode,
  type CenterSlotView,
  type CentersList,
  type MyCenterBooking,
} from '@ayman/contracts/centers';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { cairoDayKey } from '../analytics/analytics-shared';

type Tx = Prisma.TransactionClient;

/** `YYYY-MM-DD` → the `Date` a `@db.Date` column round-trips as (UTC midnight). */
function dateOf(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
/** The inverse, read from UTC parts so no timezone can shift the day. */
function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function todayKey(): string {
  return cairoDayKey(new Date());
}
/** `YYYY-MM-DD` of `key` moved by `days`. */
function addDays(key: string, days: number): string {
  const date = dateOf(key);
  date.setUTCDate(date.getUTCDate() + days);
  return keyOf(date);
}

interface SlotRow {
  id: string;
  centerId: string;
  label: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  year: number | null;
  capacity: number | null;
  isFull: boolean;
  isActive: boolean;
  priceCents: number | null;
}

function slotView(slot: SlotRow, booked: number): CenterSlotView {
  const seatsLeft = slot.capacity === null ? null : Math.max(0, slot.capacity - booked);
  return {
    id: slot.id,
    label: slot.label,
    dayOfWeek: slot.dayOfWeek,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    year: slot.year,
    full: slot.isFull || seatsLeft === 0,
    seatsLeft,
    priceCents: slot.priceCents,
  };
}

function adminSlot(slot: SlotRow, booked: number, sessions: number): AdminSlot {
  return {
    ...slotView(slot, booked),
    centerId: slot.centerId,
    isFull: slot.isFull,
    isActive: slot.isActive,
    capacity: slot.capacity,
    booked,
    sessions,
  };
}

/** «مجموعة ١ — السبت · 2:00 م – 4:00 م». */
function slotLabel(slot: Pick<SlotRow, 'label' | 'dayOfWeek' | 'startMinute' | 'endMinute'>): string {
  const time = formatSlotTime(slot);
  return slot.label ? `${slot.label} — ${time}` : time;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/** A booking covers a class day when it started on or before it and had not
 *  been cancelled by then. Compared on Cairo day keys. */
function bookedOn(booking: { createdAt: Date; cancelledAt: Date | null }, day: string): boolean {
  const start = cairoDayKey(booking.createdAt);
  if (start > day) return false;
  return booking.cancelledAt === null || cairoDayKey(booking.cancelledAt) > day;
}

/**
 * «السناتر».
 *
 * ## الحضور والغياب من غير جدول مواعيد
 *
 * مفيش «حصة يوم كذا» بتتكتب مقدمًا. الحصة (`AttendanceSession`) بتتعمل مع أول
 * طالب يتسجّل في الميعاد ده اليوم ده. فـ:
 * - يوم فيه تسجيلات = حصة اتعملت. المحجوز فيها ومسجّلش = غايب.
 * - يوم من غير ولا تسجيل = مفيش حصة (إجازة) — ومحدش بيتحسب غايب فيه.
 * وده بالحرف اللي صاحب المنصة طلبه: «لو مفيش ناس سجلت حضور، يبقى اليوم ده
 * إجازة… بس لو ناس كتير جات وفيه ناس ماجاتش، يبقى الراجل ده غايب».
 *
 * ## الفلوس
 *
 * كل حضور بياخد نسخة من سعر الحصة وقتها (`feeCents`)، والحسابات بتجمع ده.
 * تغيير السعر بعدين مابيغيّرش اللي فات.
 */
@Injectable()
export class CentersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ── shared reads ───────────────────────────────────────────────────── */

  private async bookedCounts(db: Tx | PrismaService, slotIds: string[]): Promise<Map<string, number>> {
    if (slotIds.length === 0) return new Map();
    const rows = await db.centerBooking.groupBy({
      by: ['slotId'],
      where: { slotId: { in: slotIds }, status: 'active' },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.slotId, row._count._all]));
  }

  /* ── student ────────────────────────────────────────────────────────── */

  /**
   * Active centres and their active slots — what the «أونلاين ولا سنتر»
   * question offers. `year` narrows to the slots for that school year (a slot
   * with no year is open to all). Empty when the stack has no centre, and the
   * web hides the question on an empty list.
   */
  async listPublic(year: number | null): Promise<CentersList> {
    const centers = await this.prisma.center.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        address: true,
        mapUrl: true,
        slots: {
          where: {
            isActive: true,
            ...(year === null ? {} : { OR: [{ year: null }, { year }] }),
          },
          orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
        },
      },
    });
    const booked = await this.bookedCounts(
      this.prisma,
      centers.flatMap((center) => center.slots.map((slot) => slot.id)),
    );
    return {
      centers: centers
        .filter((center) => center.slots.length > 0)
        .map((center) => ({
          id: center.id,
          name: center.name,
          address: center.address,
          mapUrl: center.mapUrl,
          slots: center.slots.map((slot) => slotView(slot, booked.get(slot.id) ?? 0)),
        })),
    };
  }

  async myBooking(userId: string): Promise<MyCenterBooking> {
    const [profile, booking] = await Promise.all([
      this.prisma.studentProfile.findUnique({ where: { userId }, select: { studentNumber: true } }),
      this.prisma.centerBooking.findFirst({
        where: { userId, status: 'active' },
        select: { slotId: true, createdAt: true, slot: { include: { center: { select: { id: true, name: true } } } } },
      }),
    ]);
    if (!profile) throw new NotFoundException('profile not found');
    if (!booking) return { booking: null, studentNumber: profile.studentNumber };
    const booked = await this.bookedCounts(this.prisma, [booking.slotId]);
    return {
      studentNumber: profile.studentNumber,
      booking: {
        slotId: booking.slotId,
        centerId: booking.slot.center.id,
        centerName: booking.slot.center.name,
        slot: slotView(booking.slot, booked.get(booking.slotId) ?? 0),
        bookedAt: booking.createdAt.toISOString(),
      },
    };
  }

  /**
   * Book `slotId` for this student, move them to it, or (with `null`) cancel
   * their booking — inside the caller's transaction, so the profile write and
   * the booking land together.
   *
   * The slot row is locked (`FOR UPDATE`) before its bookings are counted:
   * two students pressing for the last seat at once are serialised on it, and
   * the second one sees the seat gone rather than both getting it.
   *
   * `force` is the admin booking by hand — full, «فل» and the year are the
   * admin's call to override; a closed centre still is not bookable.
   */
  async setBookingTx(
    tx: Tx,
    userId: string,
    slotId: string | null,
    options: { year?: number | null; force?: boolean } = {},
  ): Promise<void> {
    const current = await tx.centerBooking.findFirst({
      where: { userId, status: 'active' },
      select: { id: true, slotId: true },
    });
    if (current?.slotId === slotId) return;

    if (slotId !== null) {
      await tx.$queryRaw`SELECT id FROM app.center_slots WHERE id = ${slotId}::uuid FOR UPDATE`;
      const slot = await tx.centerSlot.findUnique({
        where: { id: slotId },
        select: {
          id: true,
          isActive: true,
          isFull: true,
          capacity: true,
          year: true,
          center: { select: { isActive: true } },
        },
      });
      if (!slot || !slot.isActive || !slot.center.isActive) {
        throw new NotFoundException({ code: 'center_slot_not_found', message: 'slot not found' });
      }
      if (!options.force) {
        if (slot.year !== null && options.year != null && slot.year !== options.year) {
          throw new BadRequestException({ code: 'center_slot_other_year', message: 'slot is for another year' });
        }
        const booked = await tx.centerBooking.count({ where: { slotId, status: 'active' } });
        if (slot.isFull || (slot.capacity !== null && booked >= slot.capacity)) {
          throw new ConflictException({ code: 'center_slot_full', message: 'slot is full' });
        }
      }
    }

    if (current) {
      await tx.centerBooking.update({
        where: { id: current.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
    }
    if (slotId !== null) {
      await tx.centerBooking.create({ data: { userId, slotId } });
    }
  }

  /* ── admin: centres & slots ─────────────────────────────────────────── */

  async adminList(): Promise<AdminCenters> {
    const centers = await this.prisma.center.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        slots: {
          orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
          include: { _count: { select: { sessions: true } } },
        },
      },
    });
    const slotIds = centers.flatMap((center) => center.slots.map((slot) => slot.id));
    const monthStart = `${todayKey().slice(0, 7)}-01`;
    const [booked, monthAgg] = await Promise.all([
      this.bookedCounts(this.prisma, slotIds),
      this.prisma.attendanceRecord.aggregate({
        where: { session: { date: { gte: dateOf(monthStart) } } },
        _count: { _all: true },
        _sum: { feeCents: true },
      }),
    ]);
    const rows = centers.map((center) => ({
      id: center.id,
      name: center.name,
      address: center.address,
      phone: center.phone,
      mapUrl: center.mapUrl,
      isActive: center.isActive,
      createdAt: center.createdAt.toISOString(),
      slots: center.slots.map((slot) => adminSlot(slot, booked.get(slot.id) ?? 0, slot._count.sessions)),
    }));
    return {
      centers: rows,
      totals: {
        centers: rows.length,
        slots: slotIds.length,
        booked: [...booked.values()].reduce((sum, n) => sum + n, 0),
        attendedThisMonth: monthAgg._count._all,
        revenueThisMonthCents: monthAgg._sum.feeCents ?? 0,
      },
    };
  }

  async createCenter(adminId: string, input: AdminCenterWriteInput): Promise<{ id: string }> {
    const last = await this.prisma.center.aggregate({ _max: { position: true } });
    const center = await this.prisma.center.create({
      data: { ...input, position: (last._max.position ?? 0) + 1 },
      select: { id: true },
    });
    await this.record('center:create', AUDIT_RESOURCES.center, center.id, { adminId, name: input.name });
    return center;
  }

  async patchCenter(adminId: string, id: string, input: AdminCenterPatchInput): Promise<{ ok: true }> {
    await this.requireCenter(id);
    await this.prisma.center.update({ where: { id }, data: input });
    await this.record('center:update', AUDIT_RESOURCES.center, id, { adminId, fields: Object.keys(input) });
    return { ok: true };
  }

  /** Only a centre nobody ever booked or attended. One with history is
   *  switched off (`isActive: false`) instead — the attendance is a record. */
  async deleteCenter(adminId: string, id: string): Promise<{ ok: true }> {
    await this.requireCenter(id);
    const history = await this.prisma.centerSlot.count({
      where: { centerId: id, OR: [{ bookings: { some: {} } }, { sessions: { some: {} } }] },
    });
    if (history > 0) {
      throw new ConflictException({ code: 'center_has_history', message: 'deactivate instead' });
    }
    await this.prisma.center.delete({ where: { id } });
    await this.record('center:delete', AUDIT_RESOURCES.center, id, { adminId });
    return { ok: true };
  }

  async createSlot(adminId: string, centerId: string, input: AdminSlotWriteInput): Promise<{ id: string }> {
    await this.requireCenter(centerId);
    const slot = await this.prisma.centerSlot.create({ data: { ...input, centerId }, select: { id: true } });
    await this.record('center-slot:create', AUDIT_RESOURCES.centerSlot, slot.id, { adminId, centerId });
    return slot;
  }

  async patchSlot(adminId: string, id: string, input: AdminSlotPatchInput): Promise<{ ok: true }> {
    const slot = await this.requireSlot(id);
    const start = input.startMinute ?? slot.startMinute;
    const end = input.endMinute ?? slot.endMinute;
    if (end <= start) {
      throw new BadRequestException({ code: 'center_slot_times', message: 'end before start' });
    }
    await this.prisma.centerSlot.update({ where: { id }, data: input });
    await this.record('center-slot:update', AUDIT_RESOURCES.centerSlot, id, { adminId, fields: Object.keys(input) });
    return { ok: true };
  }

  async deleteSlot(adminId: string, id: string): Promise<{ ok: true }> {
    await this.requireSlot(id);
    const [bookings, sessions] = await Promise.all([
      this.prisma.centerBooking.count({ where: { slotId: id } }),
      this.prisma.attendanceSession.count({ where: { slotId: id } }),
    ]);
    if (bookings + sessions > 0) {
      throw new ConflictException({ code: 'center_slot_has_history', message: 'deactivate instead' });
    }
    await this.prisma.centerSlot.delete({ where: { id } });
    await this.record('center-slot:delete', AUDIT_RESOURCES.centerSlot, id, { adminId });
    return { ok: true };
  }

  async slotBookings(slotId: string): Promise<AdminSlotBookings> {
    const slot = await this.requireSlot(slotId);
    const [bookings, sessions, bookedCount, sessionCount] = await Promise.all([
      this.prisma.centerBooking.findMany({
        where: { slotId, status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          createdAt: true,
          cancelledAt: true,
          user: {
            select: {
              studentProfile: {
                select: {
                  studentNumber: true,
                  fullName: true,
                  phone: true,
                  fatherPhone: true,
                  year: true,
                  studyType: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.attendanceSession.findMany({
        where: { slotId },
        select: { date: true, records: { select: { userId: true } } },
      }),
      this.bookedCounts(this.prisma, [slotId]),
      this.prisma.attendanceSession.count({ where: { slotId } }),
    ]);
    const center = await this.prisma.center.findUniqueOrThrow({ where: { id: slot.centerId }, select: { name: true } });

    return {
      slot: adminSlot(slot, bookedCount.get(slotId) ?? 0, sessionCount),
      centerName: center.name,
      students: bookings
        .filter((booking) => booking.user.studentProfile !== null)
        .map((booking) => {
          const profile = booking.user.studentProfile!;
          let attended = 0;
          let absent = 0;
          for (const session of sessions) {
            const day = keyOf(session.date);
            if (!bookedOn(booking, day)) continue;
            if (session.records.some((record) => record.userId === booking.userId)) attended += 1;
            else absent += 1;
          }
          return {
            userId: booking.userId,
            studentNumber: profile.studentNumber,
            fullName: profile.fullName,
            phone: profile.phone,
            fatherPhone: profile.fatherPhone,
            year: profile.year,
            studyType: profile.studyType,
            bookedAt: booking.createdAt.toISOString(),
            attended,
            absent,
          };
        }),
    };
  }

  /** The admin books, moves or removes a student by hand — past «فل». */
  async adminSetBooking(adminId: string, userId: string, slotId: string | null): Promise<{ ok: true }> {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId }, select: { userId: true } });
    if (!profile) throw new NotFoundException('student not found');
    await this.prisma.$transaction(async (tx) => {
      await this.setBookingTx(tx, userId, slotId, { force: true });
      await tx.studentProfile.update({
        where: { userId },
        data: { attendanceMode: slotId === null ? 'online' : 'center' },
      });
    });
    await this.record('center-booking:set', AUDIT_RESOURCES.centerBooking, userId, { adminId, slotId });
    return { ok: true };
  }

  /* ── admin: the door ────────────────────────────────────────────────── */

  /**
   * One read at the door. The student is recorded in this slot's class for
   * the day (the class is created by the first read), once — a second read of
   * the same card answers `already` rather than writing a second row.
   *
   * A student who is not booked in this slot is recorded ANYWAY and flagged:
   * the person at the door decides, and refusing the read would leave a
   * student who did sit in the room with no record of it.
   */
  async scan(adminId: string, input: AttendanceScanInput): Promise<AttendanceScanResult> {
    const studentNumber = studentNumberFromCode(input.code);
    if (studentNumber === null) {
      throw new BadRequestException({ code: 'attendance_bad_code', message: 'not a student code' });
    }
    const profile = await this.prisma.studentProfile.findUnique({
      where: { studentNumber },
      select: { userId: true },
    });
    if (!profile) {
      throw new NotFoundException({ code: 'attendance_unknown_student', message: 'no such student' });
    }
    return this.attend(adminId, input.slotId, profile.userId, input.date ?? todayKey(), 'scan');
  }

  async manual(adminId: string, slotId: string, userId: string, date?: string): Promise<AttendanceScanResult> {
    const result = await this.attend(adminId, slotId, userId, date ?? todayKey(), 'manual');
    await this.record('attendance:record', AUDIT_RESOURCES.attendanceRecord, result.recordId, {
      adminId,
      slotId,
      userId,
      method: 'manual',
    });
    return result;
  }

  private async attend(
    adminId: string,
    slotId: string,
    userId: string,
    day: string,
    method: 'scan' | 'manual',
  ): Promise<AttendanceScanResult> {
    const slot = await this.requireSlot(slotId);
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { userId: true, studentNumber: true, fullName: true, year: true, user: { select: { image: true } } },
    });
    if (!student) throw new NotFoundException({ code: 'attendance_unknown_student', message: 'no such student' });

    const session = await this.prisma.attendanceSession.upsert({
      where: { slotId_date: { slotId, date: dateOf(day) } },
      create: { slotId, date: dateOf(day) },
      update: {},
      select: { id: true },
    });

    let outcome: AttendanceScanResult['outcome'] = 'recorded';
    let record: { id: string; scannedAt: Date };
    try {
      record = await this.prisma.attendanceRecord.create({
        data: {
          sessionId: session.id,
          userId,
          scannedByUserId: adminId,
          method,
          feeCents: slot.priceCents,
        },
        select: { id: true, scannedAt: true },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      outcome = 'already';
      record = await this.prisma.attendanceRecord.findUniqueOrThrow({
        where: { sessionId_userId: { sessionId: session.id, userId } },
        select: { id: true, scannedAt: true },
      });
    }

    const [bookedHere, presentCount] = await Promise.all([
      this.prisma.centerBooking.count({ where: { userId, slotId, status: 'active' } }),
      this.prisma.attendanceRecord.count({ where: { sessionId: session.id } }),
    ]);

    return {
      outcome,
      student: {
        userId: student.userId,
        studentNumber: student.studentNumber,
        fullName: student.fullName,
        year: student.year,
        avatarKey: student.user.image,
      },
      notBookedHere: bookedHere === 0,
      presentCount,
      recordId: record.id,
      scannedAt: record.scannedAt.toISOString(),
    };
  }

  /** Undo a read. The class disappears with its last record — a day with no
   *  one in it is a day off, not a class everybody missed. */
  async removeRecord(adminId: string, recordId: string): Promise<{ ok: true }> {
    const record = await this.prisma.attendanceRecord
      .findUnique({ where: { id: recordId }, select: { id: true, sessionId: true, userId: true } })
      .catch(() => null);
    if (!record) throw new NotFoundException('attendance record not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceRecord.delete({ where: { id: recordId } });
      const left = await tx.attendanceRecord.count({ where: { sessionId: record.sessionId } });
      if (left === 0) await tx.attendanceSession.delete({ where: { id: record.sessionId } });
    });
    await this.record('attendance:remove', AUDIT_RESOURCES.attendanceRecord, recordId, {
      adminId,
      userId: record.userId,
    });
    return { ok: true };
  }

  /* ── admin: the sheet ───────────────────────────────────────────────── */

  async sheet(slotId: string, from?: string, to?: string): Promise<AttendanceSheet> {
    const slot = await this.requireSlot(slotId);
    const end = to ?? todayKey();
    const start = from ?? addDays(end, -7 * 12);

    const [center, sessions, bookings, bookedCount, sessionCount] = await Promise.all([
      this.prisma.center.findUniqueOrThrow({ where: { id: slot.centerId }, select: { name: true } }),
      this.prisma.attendanceSession.findMany({
        where: { slotId, date: { gte: dateOf(start), lte: dateOf(end) } },
        orderBy: { date: 'asc' },
        select: { date: true, records: { select: { userId: true } } },
      }),
      this.prisma.centerBooking.findMany({
        where: { slotId },
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          createdAt: true,
          cancelledAt: true,
          user: { select: { studentProfile: { select: { studentNumber: true, fullName: true, phone: true } } } },
        },
      }),
      this.bookedCounts(this.prisma, [slotId]),
      this.prisma.attendanceSession.count({ where: { slotId } }),
    ]);

    const days = sessions.map((session) => keyOf(session.date));
    // Every student who held a booking on this slot at some point in the
    // window. A student can appear once even with two bookings (left, came
    // back) — their periods are unioned.
    const byUser = new Map<string, typeof bookings>();
    for (const booking of bookings) {
      if (booking.user.studentProfile === null) continue;
      const list = byUser.get(booking.userId) ?? [];
      list.push(booking);
      byUser.set(booking.userId, list);
    }

    const rows: AttendanceSheet['rows'] = [];
    for (const [userId, periods] of byUser) {
      const cells = sessions.map((session, index) => {
        if (session.records.some((record) => record.userId === userId)) return 'present' as const;
        return periods.some((period) => bookedOn(period, days[index]!)) ? ('absent' as const) : ('not_booked' as const);
      });
      if (cells.every((cell) => cell === 'not_booked') && !periods.some((p) => p.cancelledAt === null)) continue;
      const profile = periods[0]!.user.studentProfile!;
      rows.push({
        userId,
        studentNumber: profile.studentNumber,
        fullName: profile.fullName,
        phone: profile.phone,
        cells,
        attended: cells.filter((cell) => cell === 'present').length,
        absent: cells.filter((cell) => cell === 'absent').length,
      });
    }
    rows.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'));

    const guests = new Set<string>();
    for (const session of sessions) {
      for (const record of session.records) if (!byUser.has(record.userId)) guests.add(record.userId);
    }

    return {
      slot: adminSlot(slot, bookedCount.get(slotId) ?? 0, sessionCount),
      centerName: center.name,
      sessions: sessions.map((session, index) => ({
        date: days[index]!,
        present: session.records.length,
        absent: rows.filter((row) => row.cells[index] === 'absent').length,
      })),
      rows,
      guests: guests.size,
    };
  }

  /** One student's record: every class they sat, and every class held in
   *  their slot while they were booked that they missed. Newest first. */
  async studentAttendance(userId: string): Promise<StudentAttendance> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      select: { studentNumber: true, attendanceMode: true },
    });
    if (!profile) throw new NotFoundException('student not found');

    const [bookings, records] = await Promise.all([
      this.prisma.centerBooking.findMany({
        where: { userId },
        select: {
          slotId: true,
          status: true,
          createdAt: true,
          cancelledAt: true,
          slot: { include: { center: { select: { name: true } } } },
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { userId },
        select: {
          scannedAt: true,
          feeCents: true,
          session: { select: { id: true, date: true, slot: { include: { center: { select: { name: true } } } } } },
        },
      }),
    ]);

    const attendedSessions = new Set(records.map((record) => record.session.id));
    const missed = await this.prisma.attendanceSession.findMany({
      where: {
        slotId: { in: [...new Set(bookings.map((booking) => booking.slotId))] },
        id: { notIn: [...attendedSessions] },
      },
      select: { date: true, slotId: true, slot: { include: { center: { select: { name: true } } } } },
    });

    const entries: StudentAttendance['entries'] = [
      ...records.map((record) => ({
        date: keyOf(record.session.date),
        centerName: record.session.slot.center.name,
        slotLabel: slotLabel(record.session.slot),
        status: 'present' as const,
        scannedAt: record.scannedAt.toISOString(),
        feeCents: record.feeCents,
      })),
      ...missed
        .filter((session) =>
          bookings.some((booking) => booking.slotId === session.slotId && bookedOn(booking, keyOf(session.date))),
        )
        .map((session) => ({
          date: keyOf(session.date),
          centerName: session.slot.center.name,
          slotLabel: slotLabel(session.slot),
          status: 'absent' as const,
          scannedAt: null,
          feeCents: null,
        })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const active = bookings.find((booking) => booking.status === 'active') ?? null;
    const booked = active ? await this.bookedCounts(this.prisma, [active.slotId]) : new Map<string, number>();

    return {
      booking: active
        ? {
            slotId: active.slotId,
            centerName: active.slot.center.name,
            slot: slotView(active.slot, booked.get(active.slotId) ?? 0),
            bookedAt: active.createdAt.toISOString(),
          }
        : null,
      attendanceMode: profile.attendanceMode,
      studentNumber: profile.studentNumber,
      attended: entries.filter((entry) => entry.status === 'present').length,
      absent: entries.filter((entry) => entry.status === 'absent').length,
      entries: entries.slice(0, 200),
    };
  }

  /* ── admin: money ───────────────────────────────────────────────────── */

  async finance(month?: string): Promise<CenterFinance> {
    const key = month ?? todayKey().slice(0, 7);
    const [year, monthNumber] = key.split('-').map(Number) as [number, number];
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));

    const records = await this.prisma.attendanceRecord.findMany({
      where: { session: { date: { gte: start, lt: end } } },
      select: {
        feeCents: true,
        session: { select: { slot: { include: { center: { select: { id: true, name: true } } } } } },
      },
    });

    const centers = new Map<string, CenterFinance['byCenter'][number]>();
    for (const record of records) {
      const slot = record.session.slot;
      const fee = record.feeCents ?? 0;
      const center =
        centers.get(slot.center.id) ??
        { centerId: slot.center.id, centerName: slot.center.name, totalCents: 0, attendances: 0, bySlot: [] };
      center.totalCents += fee;
      center.attendances += 1;
      let row = center.bySlot.find((entry) => entry.slotId === slot.id);
      if (!row) {
        row = { slotId: slot.id, label: slotLabel(slot), totalCents: 0, attendances: 0 };
        center.bySlot.push(row);
      }
      row.totalCents += fee;
      row.attendances += 1;
      centers.set(slot.center.id, center);
    }

    const byCenter = [...centers.values()].sort((a, b) => b.totalCents - a.totalCents);
    return {
      month: key,
      totalCents: byCenter.reduce((sum, center) => sum + center.totalCents, 0),
      attendances: records.length,
      byCenter,
    };
  }

  /* ── helpers ────────────────────────────────────────────────────────── */

  private async requireCenter(id: string): Promise<void> {
    const center = await this.prisma.center.findUnique({ where: { id }, select: { id: true } }).catch(() => null);
    if (!center) throw new NotFoundException('center not found');
  }

  private async requireSlot(id: string): Promise<SlotRow> {
    const slot = await this.prisma.centerSlot.findUnique({ where: { id } }).catch(() => null);
    if (!slot) throw new NotFoundException('slot not found');
    return slot;
  }

  private async record(
    action: Parameters<AuditService['record']>[0]['action'],
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({ action, resourceType, resourceId, outcome: 'success', metadata });
  }
}
