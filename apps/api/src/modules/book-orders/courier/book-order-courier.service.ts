import { createHash } from 'node:crypto';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  BookOrderCourierEvent,
  BulkBookOrderResult,
  BulkBookOrderResultRow,
} from '@ayman/contracts/admin/book-orders';
import type { BookOrderStatus } from '@ayman/contracts/book-orders';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';

import { AuditService } from '../../../audit/audit.service';
import { isFeatureEnabled } from '../../../common/entitlements';
import { isUniqueViolation } from '../../../common/prisma/prisma-errors';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../../admin/admin.constants';
import { NotificationsService } from '../../notifications/notifications.service';
import { OutreachService } from '../../outreach/outreach.service';
import { BookOrdersService } from '../book-orders.service';
import { placeFor, torodCitiesFor, torodOrderFor, TOROD_STATUS } from './torod';
import { TorodClient } from './torod.client';
import { TorodWebhookEntrySchema, type TorodWebhookEntry } from './torod-webhook.dto';

/** Where an order can be when its data goes to the courier: paid and not yet
 *  shipped. `printing` is the normal case — the run came back from the
 *  printer; `paid` for a copy off the shelf that never saw one. */
const PUSHABLE: ReadonlySet<BookOrderStatus> = new Set(['paid', 'printing', 'returned']);

/** Where «مع المندوب» may move an order to `shipped` from. */
const BEFORE_SHIPPED: ReadonlySet<BookOrderStatus> = PUSHABLE;

/**
 * «شركة الشحن» — the two directions of the courier integration.
 *
 *   · OUT: «ابعت لشركة الشحن», pressed when the printer is DONE — «لما
 *     المطبعة تخلص ببعت الأوردرات لشركة الشحن». The order goes into Torod's
 *     system and is recorded `shipped` in the same step, which is what tells
 *     the student. Before this existed that was exactly his day: the printer
 *     says it went to the courier, he presses «اتشحن». Now one press does
 *     both, and the data is typed by nobody.
 *     Not at «ابعت للمطبعة»: data in their system is an invitation for their
 *     agent to come, and he would arrive at a printer with no books.
 *   · IN: their webhook, when they enable it (they have not, 2026-10-05):
 *     «مع المندوب» names the agent to the student, «تسليم ناجح» is
 *     `delivered`, «مؤجل» and «مرتجع» are a message each.
 *
 * Kept out of `BookOrdersService` (4 000 lines already) and leaning on it only
 * for the one rule it owns — who an order's student is.
 */
@Injectable()
export class BookOrderCourierService {
  private readonly logger = new Logger(BookOrderCourierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly outreach: OutreachService,
    private readonly bookOrders: BookOrdersService,
    private readonly torod: TorodClient,
  ) {}

  /** Both halves: the stack is entitled AND has an account to send with. */
  enabled(): boolean {
    return isFeatureEnabled('books.courier') && this.torod.credentials() !== null;
  }

  /**
   * «ابعت لشركة الشحن» on a selection.
   *
   * ## The double-push guard is a CLAIM, not a check
   *
   * Their `addorders` is not idempotent: the same order sent twice is two
   * shipments, and two agents knocking. So the row is claimed first — one
   * `UPDATE … WHERE courier_sent_at IS NULL` — and only the request that won
   * the claim makes the call. Two admins pressing at once, or one double-click,
   * cannot both get through. A refused or failed call releases the claim, so
   * fixing the address and pressing again works.
   *
   * One row at a time and never one transaction, for the reason
   * `markShippedMany` gives: an HTTP call is not rollback-able, and a batch
   * where three of thirty were refused is the normal outcome, reported row by
   * row with the courier's own words.
   */
  async sendMany(adminId: string, ids: string[]): Promise<BulkBookOrderResult> {
    if (!this.enabled()) throw new BadRequestException('ربط شركة الشحن مش متظبط على المنصة');

    const rows: BulkBookOrderResultRow[] = [];
    for (const id of ids) {
      rows.push(await this.sendOne(adminId, id));
    }
    return {
      rows,
      succeeded: rows.filter((row) => row.outcome === 'sent_to_courier').length,
      noticeFailed: 0,
      skipped: rows.filter((row) => row.outcome === 'skipped').length,
    };
  }

  private async sendOne(adminId: string, id: string): Promise<BulkBookOrderResultRow> {
    const order = await this.prisma.bookOrder.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        courseId: true,
        status: true,
        deletedAt: true,
        heldForReviewAt: true,
        courierSentAt: true,
        fullName: true,
        phone: true,
        altPhone: true,
        governorateCode: true,
        governorate: { select: { nameAr: true } },
        city: true,
        addressStreet: true,
        addressBuilding: true,
        addressNote: true,
        items: { select: { titleAr: true, quantity: true }, orderBy: { id: 'asc' } },
      },
    });

    if (!order || order.deletedAt !== null) {
      return { id, outcome: 'skipped', fullName: '', reason: 'الطلب مش موجود' };
    }
    const skip = (reason: string): BulkBookOrderResultRow => ({
      id,
      outcome: 'skipped',
      fullName: order.fullName,
      reason,
    });
    if (order.courierSentAt !== null) return skip('اتبعت لشركة الشحن قبل كده');
    if (!PUSHABLE.has(order.status)) {
      return skip(
        order.status === 'address_only'
          ? 'لسه مادفعش'
          : order.status === 'rejected'
            ? 'الطلب مرفوض'
            : 'اتشحن خلاص',
      );
    }
    // A held parcel goes nowhere — see `BookOrder.heldForReviewAt`.
    if (order.heldForReviewAt !== null) return skip('محجوز للمراجعة');

    const cities = torodCitiesFor(order.governorateCode);
    const areas = await this.torod.areasFor(cities.map((city) => city.id));
    const place = placeFor(
      order.governorateCode,
      order.governorate.nameAr,
      order.city,
      order.addressStreet,
      areas,
    );
    if (place === null) return skip(`شركة الشحن مابتوصلش ${order.governorate.nameAr}`);

    const claimed = await this.prisma.bookOrder.updateMany({
      where: { id: order.id, courierSentAt: null, deletedAt: null },
      data: { courierSentAt: new Date(), courierError: null },
    });
    if (claimed.count === 0) return skip('اتبعت لشركة الشحن قبل كده');

    const result = await this.torod.addOrder(
      torodOrderFor({ ...order, governorateNameAr: order.governorate.nameAr }, place),
    );

    if (!result.ok) {
      await this.prisma.bookOrder.update({
        where: { id: order.id },
        data: { courierSentAt: null, courierError: result.error },
      });
      return skip(`شركة الشحن رفضته: ${result.error}`);
    }

    /*
     * «اتشحن» — through the very method the button uses, so the student hears
     * it the same way (the bell, and «كتابك سلّمناه لشركة الشحن» in the
     * thread), and a row that cannot ship says why instead of half-shipping.
     * The courier already has it either way; a refusal here only means the
     * admin presses «اتشحن» by hand.
     */
    const shipped = await this.bookOrders.markShippedMany(adminId, [order.id], false);
    const shipRow = shipped.rows[0];

    await this.audit.record({
      action: 'book-order:courier',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      metadata: {
        userId: order.userId,
        courseId: order.courseId,
        adminId,
        from: order.status,
        city: place.cityName,
        area: place.areaName,
        areaMatched: place.matched,
      },
    });
    return {
      id,
      outcome: 'sent_to_courier',
      fullName: order.fullName,
      reason:
        shipRow?.outcome === 'skipped' ? `اتبعت لشركة الشحن بس ماتسجّلش اتشحن: ${shipRow.reason ?? ''}` : null,
    };
  }

  /**
   * The webhook — every status change their system reports.
   *
   * Each entry is read on its own: one we cannot parse, or one for an order we
   * do not have, is counted and skipped, never a reason to refuse the rest. The
   * answer is always 200 once the token passed, because the only thing a non-2xx
   * would buy is their system retrying entries we have already decided about.
   */
  async ingest(entries: readonly unknown[]): Promise<{ applied: number; ignored: number }> {
    let applied = 0;
    let ignored = 0;
    for (const raw of entries) {
      const parsed = TorodWebhookEntrySchema.safeParse(raw);
      if (!parsed.success) {
        ignored += 1;
        continue;
      }
      try {
        if (await this.applyEntry(parsed.data, raw)) applied += 1;
        else ignored += 1;
      } catch (error) {
        this.logger.error(`courier webhook entry for ${parsed.data.sender_UID} failed: ${String(error)}`);
        ignored += 1;
      }
    }
    return { applied, ignored };
  }

  private async applyEntry(entry: TorodWebhookEntry, raw: unknown): Promise<boolean> {
    // `sender_UID` is our order id — `torodOrderFor` sends nothing else there.
    if (!/^[0-9a-f-]{36}$/i.test(entry.sender_UID)) return false;
    const order = await this.prisma.bookOrder.findUnique({
      where: { id: entry.sender_UID },
      select: {
        id: true,
        userId: true,
        courseId: true,
        phone: true,
        fullName: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!order) return false;

    const statusName = entry.status_Name ?? `حالة ${entry.status_ID}`;
    const note = entry.status_Note ?? null;
    /*
     * What makes a replay a no-op. Everything that distinguishes one status
     * report from another, and nothing that does not — `receivedAt` is ours,
     * so including it would make every resend look new.
     */
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          entry.status_ID,
          entry.status_Date ?? null,
          note,
          entry.delivery_Name ?? null,
          entry.delivery_Phone ?? null,
        ]),
      )
      .digest('hex')
      .slice(0, 32);

    const now = new Date();
    const from = order.status;
    const live = order.deletedAt === null;
    let to: BookOrderStatus = from;
    if (live && entry.status_ID === TOROD_STATUS.withAgent && BEFORE_SHIPPED.has(from)) to = 'shipped';
    if (live && entry.status_ID === TOROD_STATUS.delivered && (BEFORE_SHIPPED.has(from) || from === 'shipped')) {
      to = 'delivered';
    }
    // «مرتجع» moves a parcel that was out to its own tab — see `markReturned`.
    if (live && entry.status_ID === TOROD_STATUS.returned && from === 'shipped') to = 'returned';

    const studentId = live ? await this.bookOrders.studentIdForOrder(order) : null;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.bookOrderCourierEvent.create({
          data: {
            orderId: order.id,
            fingerprint,
            statusId: entry.status_ID,
            statusName,
            statusNote: note,
            statusDate: entry.status_Date ?? null,
            agentName: entry.delivery_Name ?? null,
            agentPhone: entry.delivery_Phone ?? null,
            raw: (raw ?? {}) as Prisma.InputJsonValue,
          },
        });
        await tx.bookOrder.update({
          where: { id: order.id },
          data: {
            courierRef: entry.vision_ID ?? undefined,
            courierStatusId: entry.status_ID,
            courierStatusName: statusName,
            courierStatusNote: note,
            courierStatusAt: now,
            courierAgentName: entry.delivery_Name ?? null,
            courierAgentPhone: entry.delivery_Phone ?? null,
            // `shippedByUserId`/`deliveredByUserId` stay NULL: no admin said
            // so, the courier did, and the audit row below records that.
            ...(to === 'shipped' && from !== 'shipped' ? { status: 'shipped', shippedAt: now } : {}),
            ...(to === 'delivered' && from !== 'delivered' ? { status: 'delivered', deliveredAt: now } : {}),
            // A second shipment is a new one in their system — clear the guard.
            ...(to === 'returned' && from !== 'returned'
              ? { status: 'returned', returnedAt: now, returnReason: note, courierSentAt: null }
              : {}),
          },
        });
        // «مرتجع» has no notification kind; its thread message rings instead.
        if (studentId !== null && to !== from && to !== 'returned') {
          await this.notifications.emit(tx, {
            userId: studentId,
            kind: to === 'delivered' ? 'book_order_delivered' : 'book_order_shipped',
            orderId: order.id,
          });
        }
      });
    } catch (error) {
      // Seen this exact report before — a resend. Nothing to do, nobody to tell.
      if (isUniqueViolation(error)) return false;
      throw error;
    }

    if (studentId !== null && to !== from && to !== 'returned') await this.notifications.announce(studentId);

    await this.audit.record({
      action: 'book-order:courier-status',
      resourceType: AUDIT_RESOURCES.bookOrder,
      resourceId: order.id,
      outcome: 'success',
      metadata: { statusId: entry.status_ID, statusName, note, from, to, courierRef: entry.vision_ID ?? null },
    });

    if (studentId !== null) await this.tellStudent(studentId, order.fullName, entry, from, to);
    return true;
  }

  /**
   * The thread message for this status, if it gets one.
   *
   * «مع المندوب» goes on every NEW report of it — the agent's name and number
   * are news even on an order «ابعت لشركة الشحن» already shipped. «اتسلّم»
   * goes only when it MOVED the order: a parcel the admin already closed by
   * hand does not need the news a second time.
   * «مؤجل» and «مرتجع» have no status of their own, so every new report of one
   * is news. «تسليم جزئي» and codes we do not know stay on the admin's trail.
   *
   * The two that moved the order already rang the bell with their own typed
   * notification, so their text goes in quietly (`postAdminMessage`); the other
   * two have no notification kind, so they go through `sendManual`, which rings
   * it as a message.
   */
  private async tellStudent(
    studentId: string,
    fullName: string,
    entry: TorodWebhookEntry,
    from: BookOrderStatus,
    to: BookOrderStatus,
  ): Promise<void> {
    const name = fullName.trim().split(/\s+/)[0] ?? fullName;
    const note = entry.status_Note ? ` — «${entry.status_Note}»` : '';
    const notice = copy.bookCourierNotice;

    /* «مع المندوب» is news whenever it is a NEW report (the fingerprint
       already dropped repeats) — the order is usually `shipped` by now, since
       «ابعت لشركة الشحن» records that, but the agent's name and number are
       not something the student has heard yet. */
    if (entry.status_ID === TOROD_STATUS.withAgent) {
      const text =
        entry.delivery_Name && entry.delivery_Phone
          ? formatCopy(notice.withAgent, { name, agent: entry.delivery_Name, phone: entry.delivery_Phone })
          : formatCopy(notice.withAgentUnnamed, { name });
      // Quietly when this report is what shipped it (`book_order_shipped`
      // already rang the bell); as a message that rings otherwise.
      if (to === 'shipped' && from !== 'shipped') await this.outreach.postAdminMessage(studentId, text);
      else await this.ringWith(studentId, text);
      return;
    }
    if (entry.status_ID === TOROD_STATUS.delivered && to === 'delivered' && from !== 'delivered') {
      await this.outreach.postAdminMessage(studentId, formatCopy(notice.delivered, { name }));
      return;
    }
    const template =
      entry.status_ID === TOROD_STATUS.postponed
        ? notice.postponed
        : entry.status_ID === TOROD_STATUS.returned
          ? notice.returned
          : null;
    if (template === null) return;
    await this.ringWith(studentId, formatCopy(template, { name, note }));
  }

  /** A thread message that rings the bell as a message — for the statuses
   *  with no notification kind of their own. */
  private async ringWith(studentId: string, body: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.outreach.sendManual(tx, { userId: studentId, body }));
    await this.notifications.announce(studentId);
  }

  /** «فين الكتاب؟» — the whole trail for one order, oldest first. */
  async events(orderId: string): Promise<BookOrderCourierEvent[]> {
    const order = await this.prisma.bookOrder.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw new NotFoundException();
    const events = await this.prisma.bookOrderCourierEvent.findMany({
      where: { orderId },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    });
    return events.map((event) => ({
      id: event.id,
      statusId: event.statusId,
      statusName: event.statusName,
      note: event.statusNote,
      statusDate: event.statusDate,
      agentName: event.agentName,
      agentPhone: event.agentPhone,
      receivedAt: event.receivedAt.toISOString(),
    }));
  }
}
