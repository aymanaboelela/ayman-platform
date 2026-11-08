import { randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CENTER_RESERVATION_PROOF_KEY_PATTERN } from '@ayman/contracts/admin/media';
import { GRADES } from '@ayman/contracts/grades';
import {
  RESERVATION_PAGE_SIZE,
  bookingAmountCents,
  reservationGradeLabel,
  type AdminReservation,
  type AdminReservations,
  type AdminReservationsQuery,
  type CenterManager,
  type CenterPortal,
  type PublicReservation,
  type ReservationCenterPatch,
  type ReservationCenterStats,
  type ReservationConfig,
  type ReservationRail,
  type ReservationSlotInfo,
  type ReservationSettings,
  type ReservationSetup,
  type ReservationStats,
  type ReservationStatus,
  type ReviewAction,
} from '@ayman/contracts/center-reservations';
import { ARGON2_OPTIONS } from '../../auth/argon2-options';
import { TENANT_GRADES } from '../../common/tenant';
import { accountThrottleKey, phoneIdentifier, throttleKeyFor } from '../../auth/credential-check.service';
import { loginThrottle } from '../../auth/login-throttle.instance';
import { AuditService } from '../../audit/audit.service';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../admin/settings/settings.service';
import { MediaService, type UploadFile } from '../media/media.service';

/** Three segments (`prefix/xx/uuid.webp`), so the public media route cannot address it. */
const SCREENSHOT_PREFIX = 'center-reservation-proof';

/** A reservation still worth resuming rather than duplicating. */
const LIVE_STATUSES: ReservationStatus[] = ['started', 'submitted', 'confirmed'];

/** The centre owner's panel lists this many, newest first. */
const PORTAL_LIMIT = 2000;

const RESERVATION_SELECT = {
  id: true,
  number: true,
  centerId: true,
  fullName: true,
  phone: true,
  gradeSlug: true,
  track: true,
  system: true,
  gender: true,
  status: true,
  sessionPriceCents: true,
  amountCents: true,
  slot: { select: { label: true, dayOfWeek: true, startMinute: true, endMinute: true } },
  paymentMethod: true,
  senderPhone: true,
  screenshotKey: true,
  submittedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  createdAt: true,
  center: { select: { name: true } },
} satisfies Prisma.CenterReservationSelect;

type ReservationRow = Prisma.CenterReservationGetPayload<{ select: typeof RESERVATION_SELECT }>;

type Settings = ReservationSettings;

const DEFAULT_SETTINGS: Settings = {
  isOpen: false,
  headline: null,
  note: null,
  // The stack's own grades when it names them (a prep-stage teacher), else
  // the baccalaureate years Ayman's stack teaches.
  grades: TENANT_GRADES.length > 0 ? TENANT_GRADES.map((grade) => grade.slug) : ['bac1', 'bac2'],
  askTrack: true,
  askSystem: true,
  askGender: true,
  payPercent: 50,
};

function emptyStats(): ReservationStats {
  return {
    total: 0,
    started: 0,
    submitted: 0,
    confirmed: 0,
    rejected: 0,
    cancelled: 0,
    confirmedCents: 0,
    submittedCents: 0,
  };
}

/**
 * «حجز السناتر».
 *
 * Three audiences, one table:
 *
 *   · the public page — anybody, no account. A reservation's `id` (UUIDv7,
 *     74 random bits) is the bearer token the student's browser keeps, the same
 *     rule a guest book order follows. `number` is NOT a secret and never
 *     opens anything.
 *   · the dashboard — `center:read` to look, `center:write` to decide.
 *   · a centre owner — `center_manager`, resolved to ONE centre through their
 *     `center_managers` row, read-only.
 */
@Injectable()
export class CenterReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
  ) {}

  /* ── Public ──────────────────────────────────────────────────────────── */

  async config(): Promise<ReservationConfig> {
    const [settings, centers, platform] = await Promise.all([
      this.readSettings(),
      this.prisma.center.findMany({
        where: { isActive: true, reservationsOpen: true, slots: { some: { isActive: true } } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          address: true,
          mapUrl: true,
          instapay: true,
          vodafoneCash: true,
          slots: {
            where: { isActive: true },
            orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
            select: {
              id: true,
              label: true,
              dayOfWeek: true,
              startMinute: true,
              endMinute: true,
              year: true,
              priceCents: true,
              capacity: true,
              isFull: true,
            },
          },
        },
      }),
      this.platformPayment(),
    ]);
    const taken = await this.seatsTaken(centers.flatMap((center) => center.slots.map((slot) => slot.id)));
    return {
      open: settings.isOpen && centers.length > 0,
      headline: settings.headline,
      note: settings.note,
      grades: settings.grades.map((slug) => ({
        slug,
        label: reservationGradeLabel(slug),
        year: GRADES.find((grade) => grade.slug === slug)?.year ?? 1,
      })),
      payPercent: settings.payPercent,
      askTrack: settings.askTrack,
      askSystem: settings.askSystem,
      askGender: settings.askGender,
      // A closed page lists nothing — not even the names of the centres.
      centers: settings.isOpen
        ? centers.map((center) => ({
            id: center.id,
            name: center.name,
            address: center.address,
            mapUrl: center.mapUrl,
            slots: center.slots.map((slot) => ({
              id: slot.id,
              label: slot.label,
              dayOfWeek: slot.dayOfWeek,
              startMinute: slot.startMinute,
              endMinute: slot.endMinute,
              year: slot.year,
              priceCents: slot.priceCents,
              amountCents: bookingAmountCents(slot.priceCents, settings.payPercent),
              full: slot.isFull || (slot.capacity !== null && (taken.get(slot.id) ?? 0) >= slot.capacity),
            })),
            payment: {
              instapay: center.instapay ?? platform.instapay,
              vodafoneCash: center.vodafoneCash ?? platform.vodafoneCash,
            },
          }))
        : [],
    };
  }

  async uploadScreenshot(file: UploadFile): Promise<{ screenshotKey: string }> {
    const image = await this.media.uploadPrivateImage(file, SCREENSHOT_PREFIX);
    return { screenshotKey: image.storageKey };
  }

  /**
   * The form. Saved before any payment, and RESUMED rather than duplicated:
   * the same phone at the same centre with a live reservation gets that
   * reservation back — a student who closed the tab at the transfer step and
   * came back the next day is one row, not two, and the centre does not call
   * them twice.
   */
  async create(input: {
    centerId: string;
    slotId: string;
    fullName: string;
    phone: string;
    gradeSlug: string;
    track: 'arabic' | 'languages' | null;
    system: 'general' | 'azhar' | null;
    gender: 'male' | 'female' | null;
  }): Promise<PublicReservation> {
    const settings = await this.readSettings();
    if (!settings.isOpen) throw new ConflictException({ code: 'reservations_closed', message: 'reservations are closed' });
    const center = await this.prisma.center.findFirst({
      where: { id: input.centerId, isActive: true, reservationsOpen: true },
      select: { id: true },
    });
    if (center === null) throw new ConflictException({ code: 'center_closed', message: 'this centre is not taking reservations' });
    if (!settings.grades.includes(input.gradeSlug)) throw new BadRequestException('grade not offered');
    const gradeYear = GRADES.find((grade) => grade.slug === input.gradeSlug)?.year;
    const slot = await this.prisma.centerSlot.findFirst({
      where: { id: input.slotId, centerId: center.id, isActive: true },
      select: { id: true, year: true, priceCents: true, capacity: true, isFull: true },
    });
    if (slot === null) throw new ConflictException({ code: 'slot_closed', message: 'this group is not available' });
    if (slot.year !== null && slot.year !== gradeYear) throw new BadRequestException('this group is for another year');
    const pricing = {
      slotId: slot.id,
      sessionPriceCents: slot.priceCents,
      amountCents: bookingAmountCents(slot.priceCents, settings.payPercent),
    };

    // A question the page does not ask is stored as null, whatever was sent.
    const answers = {
      fullName: input.fullName.replace(/\s+/g, ' ').trim(),
      gradeSlug: input.gradeSlug,
      track: settings.askTrack ? input.track : null,
      system: settings.askSystem ? input.system : null,
      gender: settings.askGender ? input.gender : null,
    };
    if (settings.askTrack && answers.track === null) throw new BadRequestException('track required');
    if (settings.askSystem && answers.system === null) throw new BadRequestException('system required');
    if (settings.askGender && answers.gender === null) throw new BadRequestException('gender required');

    const existing = await this.prisma.centerReservation.findFirst({
      where: { centerId: center.id, phone: input.phone, status: { in: LIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    if (existing !== null) {
      // Only an unpaid one takes the new answers; a paid one is evidence.
      if (existing.status === 'started') {
        if (await this.slotIsFull(slot)) throw new ConflictException({ code: 'slot_full', message: 'this group is full' });
        await this.prisma.centerReservation.update({ where: { id: existing.id }, data: { ...answers, ...pricing } });
      }
      return this.publicView(existing.id);
    }

    if (await this.slotIsFull(slot)) throw new ConflictException({ code: 'slot_full', message: 'this group is full' });
    const row = await this.prisma.centerReservation.create({
      data: { ...answers, ...pricing, centerId: center.id, phone: input.phone },
      select: { id: true },
    });
    return this.publicView(row.id);
  }

  /**
   * The transfer. `started` or `rejected` → `submitted`; a rejected one may be
   * sent again with a new screenshot. A reservation with no price is
   * «submitted» by the same call with no screenshot — see `confirmFree`.
   */
  async submitPayment(
    id: string,
    input: { method: ReservationRail; senderPhone: string; screenshotKey: string },
  ): Promise<PublicReservation> {
    if (!CENTER_RESERVATION_PROOF_KEY_PATTERN.test(input.screenshotKey)) {
      throw new BadRequestException('screenshotKey was not issued by POST /center-reservations/screenshot');
    }
    const row = await this.prisma.centerReservation.findUnique({ where: { id }, select: { status: true } });
    if (row === null) throw new NotFoundException();
    if (row.status !== 'started' && row.status !== 'rejected') {
      throw new ConflictException({ code: 'already_submitted', message: 'this reservation already has a payment' });
    }
    await this.prisma.centerReservation.update({
      where: { id },
      data: {
        status: 'submitted',
        paymentMethod: input.method,
        senderPhone: input.senderPhone,
        screenshotKey: input.screenshotKey,
        submittedAt: new Date(),
        rejectionReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
      },
    });
    return this.publicView(id);
  }

  /** A group with no price: the form alone is the reservation, waiting for review. */
  async confirmFree(id: string): Promise<PublicReservation> {
    const row = await this.prisma.centerReservation.findUnique({ where: { id }, select: { status: true, amountCents: true } });
    if (row === null) throw new NotFoundException();
    if (row.amountCents > 0) throw new BadRequestException('this reservation needs a payment');
    if (row.status === 'started') {
      await this.prisma.centerReservation.update({ where: { id }, data: { status: 'submitted', submittedAt: new Date() } });
    }
    return this.publicView(id);
  }

  async getPublic(id: string): Promise<PublicReservation> {
    return this.publicView(id);
  }

  private async publicView(id: string): Promise<PublicReservation> {
    const row = await this.prisma.centerReservation.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        fullName: true,
        phone: true,
        sessionPriceCents: true,
        amountCents: true,
        rejectionReason: true,
        slot: { select: { label: true, dayOfWeek: true, startMinute: true, endMinute: true } },
        center: { select: { id: true, name: true, instapay: true, vodafoneCash: true } },
      },
    });
    if (row === null) throw new NotFoundException();
    const platform = await this.platformPayment();
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      fullName: row.fullName,
      phone: row.phone,
      centerId: row.center.id,
      centerName: row.center.name,
      slot: slotInfo(row.slot),
      sessionPriceCents: row.sessionPriceCents,
      amountCents: row.amountCents,
      payment: {
        instapay: row.center.instapay ?? platform.instapay,
        vodafoneCash: row.center.vodafoneCash ?? platform.vodafoneCash,
      },
      rejectionReason: row.rejectionReason,
    };
  }

  /* ── Dashboard ───────────────────────────────────────────────────────── */

  async adminList(query: AdminReservationsQuery & { page: number }): Promise<AdminReservations> {
    const where = this.listWhere(query);
    const [items, matching, totals, byCenter] = await Promise.all([
      this.prisma.centerReservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * RESERVATION_PAGE_SIZE,
        take: RESERVATION_PAGE_SIZE,
        select: RESERVATION_SELECT,
      }),
      this.prisma.centerReservation.count({ where }),
      this.stats(),
      this.statsByCenter(),
    ]);
    return {
      items: items.map(toAdmin),
      matching,
      page: query.page,
      pageSize: RESERVATION_PAGE_SIZE,
      totals,
      byCenter,
    };
  }

  private listWhere(query: AdminReservationsQuery): Prisma.CenterReservationWhereInput {
    const where: Prisma.CenterReservationWhereInput = {};
    if (query.centerId) where.centerId = query.centerId;
    if (query.status) where.status = query.status;
    const q = query.q?.trim();
    if (q) {
      const digits = q.replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      const or: Prisma.CenterReservationWhereInput[] = [{ fullName: { contains: q, mode: 'insensitive' } }];
      if (digits.length >= 3) {
        // `010…` is stored `+2010…` — match on the national digits.
        const national = digits.startsWith('0') ? digits.slice(1) : digits;
        or.push({ phone: { contains: national } }, { senderPhone: { contains: national } });
      }
      if (/^\d{1,9}$/.test(digits)) or.push({ number: Number(digits) });
      where.OR = or;
    }
    return where;
  }

  async review(adminId: string, id: string, action: ReviewAction, reason?: string): Promise<AdminReservation> {
    const row = await this.prisma.centerReservation.findUnique({
      where: { id },
      select: { status: true, screenshotKey: true },
    });
    if (row === null) throw new NotFoundException();

    let status: ReservationStatus;
    switch (action) {
      case 'confirm':
        // Any state but a cancelled one: «دفع كاش في السنتر» confirms a
        // reservation that never sent a screenshot.
        if (row.status === 'cancelled') throw new ConflictException('reopen it first');
        status = 'confirmed';
        break;
      case 'reject':
        if (row.status !== 'submitted' && row.status !== 'started') throw new ConflictException('nothing to reject');
        status = 'rejected';
        break;
      case 'cancel':
        status = 'cancelled';
        break;
      case 'reopen':
        status = row.screenshotKey ? 'submitted' : 'started';
        break;
    }

    await this.prisma.centerReservation.update({
      where: { id },
      data: {
        status,
        reviewedAt: action === 'reopen' ? null : new Date(),
        reviewedByUserId: action === 'reopen' ? null : adminId,
        rejectionReason: action === 'reject' ? reason?.trim() || null : null,
      },
    });
    await this.audit.record({
      action: 'center-reservation:review',
      resourceType: 'center_reservations',
      resourceId: id,
      outcome: 'success',
      metadata: { adminId, action, from: row.status, to: status },
    });
    return this.adminOne(id);
  }

  async remove(adminId: string, id: string): Promise<{ ok: true }> {
    const row = await this.prisma.centerReservation.findUnique({ where: { id }, select: { number: true, phone: true } });
    if (row === null) throw new NotFoundException();
    await this.prisma.centerReservation.delete({ where: { id } });
    await this.audit.record({
      action: 'center-reservation:delete',
      resourceType: 'center_reservations',
      resourceId: id,
      outcome: 'success',
      metadata: { adminId, number: row.number, phone: row.phone },
    });
    return { ok: true };
  }

  async screenshotKeyFor(id: string, centerId?: string): Promise<string> {
    const row = await this.prisma.centerReservation.findUnique({ where: { id }, select: { screenshotKey: true, centerId: true } });
    if (row === null || row.screenshotKey === null) throw new NotFoundException();
    if (centerId !== undefined && row.centerId !== centerId) throw new NotFoundException();
    return row.screenshotKey;
  }

  private async adminOne(id: string): Promise<AdminReservation> {
    const row = await this.prisma.centerReservation.findUnique({ where: { id }, select: RESERVATION_SELECT });
    if (row === null) throw new NotFoundException();
    return toAdmin(row);
  }

  async setup(): Promise<ReservationSetup> {
    const [settings, centers, managers, platformPayment] = await Promise.all([
      this.readSettings(),
      this.prisma.center.findMany({
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          isActive: true,
          reservationsOpen: true,
          instapay: true,
          vodafoneCash: true,
          slots: { where: { isActive: true }, select: { priceCents: true } },
        },
      }),
      this.managers(),
      this.platformPayment(),
    ]);
    return {
      settings,
      centers: centers.map(({ slots, ...center }) => ({
        ...center,
        slots: slots.length,
        pricedSlots: slots.filter((slot) => slot.priceCents !== null && slot.priceCents > 0).length,
      })),
      managers,
      platformPayment,
    };
  }

  async writeSettings(adminId: string, input: Settings): Promise<Settings> {
    const data = {
      isOpen: input.isOpen,
      headline: input.headline?.trim() || null,
      note: input.note?.trim() || null,
      grades: [...new Set(input.grades)],
      askTrack: input.askTrack,
      askSystem: input.askSystem,
      askGender: input.askGender,
      payPercent: Math.min(100, Math.max(0, Math.round(input.payPercent))),
    };
    await this.prisma.centerReservationSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await this.audit.record({
      action: 'center-reservation:settings',
      resourceType: 'center_reservation_settings',
      resourceId: '1',
      outcome: 'success',
      metadata: { adminId, isOpen: data.isOpen },
    });
    return this.readSettings();
  }

  async patchCenter(adminId: string, centerId: string, input: ReservationCenterPatch): Promise<ReservationSetup> {
    const found = await this.prisma.center.findUnique({ where: { id: centerId }, select: { id: true } });
    if (found === null) throw new NotFoundException();
    await this.prisma.center.update({
      where: { id: centerId },
      data: {
        ...(input.reservationsOpen !== undefined ? { reservationsOpen: input.reservationsOpen } : {}),
        ...(input.instapay !== undefined ? { instapay: input.instapay } : {}),
        ...(input.vodafoneCash !== undefined ? { vodafoneCash: input.vodafoneCash } : {}),
      },
    });
    await this.audit.record({
      action: 'center-reservation:center',
      resourceType: 'centers',
      resourceId: centerId,
      outcome: 'success',
      metadata: { adminId, fields: Object.keys(input) },
    });
    return this.setup();
  }

  /* ── Centre owners' logins ───────────────────────────────────────────── */

  async managers(): Promise<CenterManager[]> {
    const rows = await this.prisma.centerManager.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        centerId: true,
        createdAt: true,
        center: { select: { name: true } },
        user: { select: { id: true, name: true, phoneNumber: true, bannedAt: true, role: true } },
      },
    });
    return rows
      .filter((row) => row.user.role === 'center_manager')
      .map((row) => ({
        id: row.user.id,
        name: row.user.name,
        phone: row.user.phoneNumber,
        centerId: row.centerId,
        centerName: row.center.name,
        disabled: row.user.bannedAt !== null,
        createdAt: row.createdAt.toISOString(),
      }));
  }

  /** `MontageService.createEditor`, for a centre: a fresh account that can sign in at once. */
  async createManager(
    adminId: string,
    input: { centerId: string; name: string; phone: string; password: string },
  ): Promise<CenterManager[]> {
    const center = await this.prisma.center.findUnique({ where: { id: input.centerId }, select: { id: true } });
    if (center === null) throw new NotFoundException('السنتر ده مش موجود');
    const id = randomBytes(24).toString('base64url').replace(/[-_]/g, '').slice(0, 32);
    const hash = await argon2.hash(input.password, ARGON2_OPTIONS);
    try {
      await this.prisma.$transaction([
        this.prisma.user.create({
          data: {
            id,
            name: input.name,
            email: null,
            emailVerified: false,
            role: 'center_manager',
            phoneNumber: input.phone,
            phoneNumberVerified: false,
          },
        }),
        this.prisma.account.create({
          data: { id: randomUUID(), providerId: 'credential', accountId: id, userId: id, password: hash },
        }),
        this.prisma.centerManager.create({ data: { userId: id, centerId: center.id } }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('الرقم ده عليه حساب قبل كده — رقم تاني مطلوب');
      throw error;
    }
    await this.audit.record({
      action: 'center-manager:create',
      resourceType: 'user',
      resourceId: id,
      outcome: 'success',
      metadata: { adminId, centerId: center.id, name: input.name, phone: input.phone },
    });
    return this.managers();
  }

  async setManagerPassword(adminId: string, id: string, password: string): Promise<CenterManager[]> {
    const user = await this.managerRow(id);
    const hash = await argon2.hash(password, ARGON2_OPTIONS);
    await this.prisma.$transaction([
      this.prisma.account.upsert({
        where: { providerId_accountId: { providerId: 'credential', accountId: id } },
        update: { password: hash },
        create: { id: randomUUID(), providerId: 'credential', accountId: id, userId: id, password: hash },
      }),
      this.prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    if (user.phoneNumber) loginThrottle.clear(throttleKeyFor(phoneIdentifier(user.phoneNumber)));
    loginThrottle.clear(accountThrottleKey(id));
    await this.audit.record({
      action: 'center-manager:password',
      resourceType: 'user',
      resourceId: id,
      outcome: 'success',
      metadata: { adminId },
    });
    return this.managers();
  }

  async setManagerDisabled(adminId: string, id: string, disabled: boolean): Promise<CenterManager[]> {
    await this.managerRow(id);
    if (disabled) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id },
          data: { bannedAt: new Date(), bannedReason: 'حساب السنتر اتوقف.', bannedByUserId: adminId },
        }),
        this.prisma.session.deleteMany({ where: { userId: id } }),
        this.prisma.sessionDevice.deleteMany({ where: { userId: id } }),
      ]);
    } else {
      await this.prisma.user.update({ where: { id }, data: { bannedAt: null, bannedReason: null, bannedByUserId: null } });
    }
    await this.audit.record({
      action: disabled ? 'center-manager:disable' : 'center-manager:enable',
      resourceType: 'user',
      resourceId: id,
      outcome: 'success',
      metadata: { adminId },
    });
    return this.managers();
  }

  /** Acts on `center_manager` accounts ONLY — a password set here can never land on anyone else. */
  private async managerRow(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'center_manager' },
      select: { id: true, phoneNumber: true },
    });
    if (user === null) throw new NotFoundException('الحساب ده مش حساب سنتر');
    return user;
  }

  /* ── The centre owner's panel ────────────────────────────────────────── */

  /**
   * The caller's own centre. An admin previewing the panel passes `centerId`
   * (honoured only for `center:read`, by the controller); everybody else is
   * resolved through their `center_managers` row and nothing else.
   */
  async portalCenterId(userId: string, previewCenterId?: string): Promise<string> {
    if (previewCenterId) return previewCenterId;
    const link = await this.prisma.centerManager.findUnique({ where: { userId }, select: { centerId: true } });
    if (link === null) throw new NotFoundException({ code: 'not_linked', message: 'this account has no centre' });
    return link.centerId;
  }

  async portal(centerId: string): Promise<CenterPortal> {
    const center = await this.prisma.center.findUnique({ where: { id: centerId }, select: { id: true, name: true, address: true } });
    if (center === null) throw new NotFoundException();
    const [rows, stats] = await Promise.all([
      this.prisma.centerReservation.findMany({
        where: { centerId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PORTAL_LIMIT,
        select: RESERVATION_SELECT,
      }),
      this.stats(centerId),
    ]);
    return { center, stats, reservations: rows.map(toAdmin) };
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  private async stats(centerId?: string): Promise<ReservationStats> {
    const groups = await this.prisma.centerReservation.groupBy({
      by: ['status'],
      where: centerId ? { centerId } : {},
      _count: { _all: true },
      _sum: { amountCents: true },
    });
    const out = emptyStats();
    for (const group of groups) {
      out[group.status] = group._count._all;
      out.total += group._count._all;
      if (group.status === 'confirmed') out.confirmedCents = group._sum.amountCents ?? 0;
      if (group.status === 'submitted') out.submittedCents = group._sum.amountCents ?? 0;
    }
    return out;
  }

  private async statsByCenter(): Promise<ReservationCenterStats[]> {
    const [groups, centers] = await Promise.all([
      this.prisma.centerReservation.groupBy({
        by: ['centerId', 'status'],
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      this.prisma.center.findMany({
        where: { OR: [{ reservationsOpen: true }, { reservations: { some: {} } }] },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true },
      }),
    ]);
    return centers.map((center) => {
      const out = emptyStats();
      for (const group of groups) {
        if (group.centerId !== center.id) continue;
        out[group.status] = group._count._all;
        out.total += group._count._all;
        if (group.status === 'confirmed') out.confirmedCents = group._sum.amountCents ?? 0;
        if (group.status === 'submitted') out.submittedCents = group._sum.amountCents ?? 0;
      }
      return { ...out, centerId: center.id, centerName: center.name };
    });
  }

  private async readSettings(): Promise<Settings> {
    const row = await this.prisma.centerReservationSettings.findUnique({ where: { id: 1 } });
    if (row === null) return DEFAULT_SETTINGS;
    return {
      isOpen: row.isOpen,
      headline: row.headline,
      note: row.note,
      grades: row.grades.length > 0 ? row.grades : DEFAULT_SETTINGS.grades,
      askTrack: row.askTrack,
      askSystem: row.askSystem,
      askGender: row.askGender,
      payPercent: row.payPercent,
    } as Settings;
  }

  /** Seats a group has given away: active account bookings + paid/confirmed reservations. */
  private async seatsTaken(slotIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (slotIds.length === 0) return out;
    const [bookings, reservations] = await Promise.all([
      this.prisma.centerBooking.groupBy({
        by: ['slotId'],
        where: { slotId: { in: slotIds }, status: 'active' },
        _count: { _all: true },
      }),
      this.prisma.centerReservation.groupBy({
        by: ['slotId'],
        where: { slotId: { in: slotIds }, status: { in: ['submitted', 'confirmed'] } },
        _count: { _all: true },
      }),
    ]);
    for (const row of bookings) out.set(row.slotId, (out.get(row.slotId) ?? 0) + row._count._all);
    for (const row of reservations) {
      if (row.slotId) out.set(row.slotId, (out.get(row.slotId) ?? 0) + row._count._all);
    }
    return out;
  }

  private async slotIsFull(slot: { id: string; capacity: number | null; isFull: boolean }): Promise<boolean> {
    if (slot.isFull) return true;
    if (slot.capacity === null) return false;
    return ((await this.seatsTaken([slot.id])).get(slot.id) ?? 0) >= slot.capacity;
  }

  /** The platform's own transfer numbers — the fallback under every centre. */
  private async platformPayment(): Promise<{ instapay: string | null; vodafoneCash: string | null }> {
    try {
      const site = await this.settings.read();
      return { instapay: site.contact.instapay ?? null, vodafoneCash: site.contact.vodafoneCash ?? null };
    } catch {
      return { instapay: null, vodafoneCash: null };
    }
  }
}

function toAdmin(row: ReservationRow): AdminReservation {
  return {
    id: row.id,
    number: row.number,
    centerId: row.centerId,
    centerName: row.center.name,
    fullName: row.fullName,
    phone: row.phone,
    gradeSlug: row.gradeSlug,
    track: row.track as AdminReservation['track'],
    system: row.system as AdminReservation['system'],
    gender: row.gender as AdminReservation['gender'],
    status: row.status,
    slot: slotInfo(row.slot),
    sessionPriceCents: row.sessionPriceCents,
    amountCents: row.amountCents,
    paymentMethod: row.paymentMethod as AdminReservation['paymentMethod'],
    senderPhone: row.senderPhone,
    hasScreenshot: row.screenshotKey !== null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
  };
}

function slotInfo(
  slot: { label: string | null; dayOfWeek: number; startMinute: number; endMinute: number } | null,
): ReservationSlotInfo {
  return slot === null
    ? null
    : { label: slot.label, dayOfWeek: slot.dayOfWeek, startMinute: slot.startMinute, endMinute: slot.endMinute };
}
