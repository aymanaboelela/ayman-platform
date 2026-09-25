import { z } from '@ayman/contracts/zod';
import { AttendanceModeSchema, CenterSlotViewSchema, DayOfWeekSchema, StudyTypeSchema } from '@ayman/contracts/centers';

/**
 * «السناتر» — the admin's half: centres, their weekly slots, who booked what,
 * the attendance sheet, the door scanner and the money a centre brought in.
 */

const MinuteSchema = z.number().int().min(0).max(1440);
const OptionalText = z.string().trim().max(300).nullable().default(null);

/* ── centres ─────────────────────────────────────────────────────────────── */

export const AdminCenterWriteSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    address: OptionalText,
    phone: z.string().trim().max(40).nullable().default(null),
    mapUrl: z.url().max(500).nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .strict();
export type AdminCenterWriteInput = z.infer<typeof AdminCenterWriteSchema>;

export const AdminCenterPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    mapUrl: z.url().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type AdminCenterPatchInput = z.infer<typeof AdminCenterPatchSchema>;

/* ── slots ───────────────────────────────────────────────────────────────── */

const slotShape = {
  label: z.string().trim().max(80).nullable().default(null),
  dayOfWeek: DayOfWeekSchema,
  startMinute: MinuteSchema,
  endMinute: MinuteSchema,
  year: z.number().int().min(1).max(3).nullable().default(null),
  capacity: z.number().int().min(1).max(5000).nullable().default(null),
  priceCents: z.number().int().min(0).max(100_000_000).nullable().default(null),
  isFull: z.boolean().default(false),
  isActive: z.boolean().default(true),
};

export const AdminSlotWriteSchema = z
  .object(slotShape)
  .strict()
  .refine((slot) => slot.endMinute > slot.startMinute, {
    message: 'ميعاد النهاية لازم يبقى بعد البداية',
    path: ['endMinute'],
  });
export type AdminSlotWriteInput = z.infer<typeof AdminSlotWriteSchema>;

export const AdminSlotPatchSchema = z
  .object({
    label: z.string().trim().max(80).nullable().optional(),
    dayOfWeek: DayOfWeekSchema.optional(),
    startMinute: MinuteSchema.optional(),
    endMinute: MinuteSchema.optional(),
    year: z.number().int().min(1).max(3).nullable().optional(),
    capacity: z.number().int().min(1).max(5000).nullable().optional(),
    priceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
    isFull: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type AdminSlotPatchInput = z.infer<typeof AdminSlotPatchSchema>;

export const AdminSlotSchema = CenterSlotViewSchema.extend({
  centerId: z.uuid(),
  isFull: z.boolean(),
  isActive: z.boolean(),
  capacity: z.number().int().nullable(),
  /** Live bookings right now. */
  booked: z.number().int(),
  /** Classes held so far (days with at least one scan). */
  sessions: z.number().int(),
});
export type AdminSlot = z.infer<typeof AdminSlotSchema>;

export const AdminCenterSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  mapUrl: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  slots: z.array(AdminSlotSchema),
});
export type AdminCenter = z.infer<typeof AdminCenterSchema>;

export const AdminCentersSchema = z.object({
  centers: z.array(AdminCenterSchema),
  /** Tiles over the page. */
  totals: z.object({
    centers: z.number().int(),
    slots: z.number().int(),
    booked: z.number().int(),
    attendedThisMonth: z.number().int(),
    revenueThisMonthCents: z.number().int(),
  }),
});
export type AdminCenters = z.infer<typeof AdminCentersSchema>;

/* ── bookings ────────────────────────────────────────────────────────────── */

export const AdminBookedStudentSchema = z.object({
  userId: z.string(),
  studentNumber: z.number().int(),
  fullName: z.string(),
  phone: z.string().nullable(),
  fatherPhone: z.string().nullable(),
  year: z.number().int().nullable(),
  studyType: StudyTypeSchema.nullable(),
  bookedAt: z.iso.datetime(),
  /** Of the classes held since they booked. */
  attended: z.number().int(),
  absent: z.number().int(),
});
export type AdminBookedStudent = z.infer<typeof AdminBookedStudentSchema>;

export const AdminSlotBookingsSchema = z.object({
  slot: AdminSlotSchema,
  centerName: z.string(),
  students: z.array(AdminBookedStudentSchema),
});
export type AdminSlotBookings = z.infer<typeof AdminSlotBookingsSchema>;

/** Admin books (or moves, or removes) a student by hand. `null` = remove. */
export const AdminSetBookingSchema = z.object({ slotId: z.uuid().nullable() }).strict();

/* ── attendance ──────────────────────────────────────────────────────────── */

/** `YYYY-MM-DD`, Cairo. */
export const CairoDateSchema = z.iso.date();

/** One read at the door. `code` is whatever the camera or USB scanner saw. */
export const AttendanceScanSchema = z
  .object({
    slotId: z.uuid(),
    code: z.string().trim().min(1).max(64),
    /** Defaults to today in Cairo. Only an admin fixing yesterday sends it. */
    date: CairoDateSchema.optional(),
  })
  .strict();
export type AttendanceScanInput = z.infer<typeof AttendanceScanSchema>;

export const AttendanceScanResultSchema = z.object({
  /** `recorded` — a new «حضر»; `already` — scanned before today. */
  outcome: z.enum(['recorded', 'already']),
  student: z.object({
    userId: z.string(),
    studentNumber: z.number().int(),
    fullName: z.string(),
    year: z.number().int().nullable(),
    /** `User.image` — a media key; the web turns it into a URL. */
    avatarKey: z.string().nullable(),
  }),
  /** The student is not booked in THIS slot — recorded anyway, flagged so the
   *  person at the door can say «إنت مش في المجموعة دي». */
  notBookedHere: z.boolean(),
  /** Present so far in this class. */
  presentCount: z.number().int(),
  recordId: z.uuid(),
  scannedAt: z.iso.datetime(),
});
export type AttendanceScanResult = z.infer<typeof AttendanceScanResultSchema>;

export const AttendanceManualSchema = z
  .object({ slotId: z.uuid(), userId: z.string().min(1), date: CairoDateSchema.optional() })
  .strict();

export const AttendanceCellSchema = z.enum(['present', 'absent', 'not_booked']);

/** The sheet: one column per class held, one row per booked student. */
export const AttendanceSheetSchema = z.object({
  slot: AdminSlotSchema,
  centerName: z.string(),
  /** Classes held in the window, oldest first. A date with no scan at all is
   *  not here — that is a day off, and nobody is absent on it. */
  sessions: z.array(
    z.object({ date: CairoDateSchema, present: z.number().int(), absent: z.number().int() }),
  ),
  rows: z.array(
    z.object({
      userId: z.string(),
      studentNumber: z.number().int(),
      fullName: z.string(),
      phone: z.string().nullable(),
      /** Same order as `sessions`. */
      cells: z.array(AttendanceCellSchema),
      attended: z.number().int(),
      absent: z.number().int(),
    }),
  ),
  /** Walk-ins: scanned in a class of this slot while booked elsewhere/nowhere. */
  guests: z.number().int(),
});
export type AttendanceSheet = z.infer<typeof AttendanceSheetSchema>;

export const AttendanceSheetQuerySchema = z
  .object({ from: CairoDateSchema.optional(), to: CairoDateSchema.optional() })
  .strict();

/** A student's own attendance record, newest first. */
export const StudentAttendanceSchema = z.object({
  booking: z
    .object({ slotId: z.uuid(), centerName: z.string(), slot: CenterSlotViewSchema, bookedAt: z.iso.datetime() })
    .nullable(),
  attendanceMode: AttendanceModeSchema.nullable(),
  studentNumber: z.number().int(),
  attended: z.number().int(),
  absent: z.number().int(),
  entries: z.array(
    z.object({
      date: CairoDateSchema,
      centerName: z.string(),
      slotLabel: z.string(),
      status: z.enum(['present', 'absent']),
      scannedAt: z.iso.datetime().nullable(),
      feeCents: z.number().int().nullable(),
    }),
  ),
});
export type StudentAttendance = z.infer<typeof StudentAttendanceSchema>;

/* ── money ───────────────────────────────────────────────────────────────── */

export const CenterFinanceQuerySchema = z
  .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() })
  .strict();

export const CenterFinanceSchema = z.object({
  month: z.string(),
  totalCents: z.number().int(),
  attendances: z.number().int(),
  byCenter: z.array(
    z.object({
      centerId: z.uuid(),
      centerName: z.string(),
      totalCents: z.number().int(),
      attendances: z.number().int(),
      bySlot: z.array(
        z.object({ slotId: z.uuid(), label: z.string(), totalCents: z.number().int(), attendances: z.number().int() }),
      ),
    }),
  ),
});
export type CenterFinance = z.infer<typeof CenterFinanceSchema>;
