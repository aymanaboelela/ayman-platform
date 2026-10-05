import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import type { SettingsService } from '../../admin/settings/settings.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { OutreachService } from '../../outreach/outreach.service';
import type { BookOrdersService } from '../book-orders.service';
import { BookOrderCourierService } from './book-order-courier.service';
import type { TorodClient } from './torod.client';
import type { TorodOrder } from './torod';

/**
 * The courier integration against the real database, with Torod itself stubbed:
 * what we SEND is pinned by `torod.spec.ts`; this pins what happens to an order
 * on each side of the call — the claim, the release on a refusal, and every
 * status their webhook can move it through.
 */
describe('BookOrderCourierService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const notifications = new NotificationsService(prisma);
  const outreach = new OutreachService(prisma, notifications, {} as SettingsService);
  /* The two things borrowed from `BookOrdersService`: who the student is, and
     «اتشحن» — stubbed to the status change it makes, because the real one
     also posts the student's notice through services this suite does not
     build. That it is CALLED, and only after the courier accepted, is what is
     pinned here. */
  const shippedIds: string[] = [];
  const bookOrders = {
    studentIdForOrder: async (order: { userId: string | null }) => order.userId,
    markShippedMany: async (_adminId: string, ids: string[]) => {
      shippedIds.push(...ids);
      await prisma.bookOrder.updateMany({ where: { id: { in: ids } }, data: { status: 'shipped', shippedAt: new Date() } });
      return {
        rows: ids.map((id) => ({ id, outcome: 'shipped' as const, fullName: '', reason: null })),
        succeeded: ids.length,
        noticeFailed: 0,
        skipped: 0,
      };
    },
  } as unknown as BookOrdersService;

  const sent: TorodOrder[] = [];
  let refuseWith: string | null = null;
  const torod = {
    credentials: () => ({ login: 'x', password: 'y' }),
    areasFor: async () => new Map([[1, ['مدينة نصر', 'مجهول']]]),
    addOrder: async (order: TorodOrder) => {
      sent.push(order);
      return refuseWith === null ? { ok: true as const } : { ok: false as const, error: refuseWith };
    },
  } as unknown as TorodClient;

  const service = new BookOrderCourierService(prisma, audit, notifications, outreach, bookOrders, torod);

  let adminId = '';
  let studentId = '';
  const created: string[] = [];

  async function order(status: 'paid' | 'printing' | 'shipped' = 'printing', sent = false) {
    const now = new Date();
    const row = await prisma.bookOrder.create({
      data: {
        userId: studentId,
        amountCents: 30000,
        itemsCents: 25000,
        shippingCents: 5000,
        fullName: 'منى أحمد',
        phone: '01012345678',
        altPhone: '01112345678',
        governorateCode: '01',
        city: 'مدينة نصر',
        addressStreet: 'ش عباس العقاد',
        status,
        paidAt: now,
        printedAt: status === 'printing' ? now : null,
        courierSentAt: sent ? now : null,
        items: { create: [{ titleAr: 'كتاب البرمجة', unitPriceCents: 25000, quantity: 1 }] },
      },
      select: { id: true },
    });
    created.push(row.id);
    return row.id;
  }

  function report(orderId: string, statusId: number, extra: Record<string, unknown> = {}) {
    return {
      vision_ID: '2235',
      sender_Code: 'BK-X',
      sender_UID: orderId,
      delivery_Name: 'محمد',
      delivery_Phone: '0100000000',
      status_ID: statusId,
      status_Name: 'حالة',
      status_Note: null,
      status_Date: '2026-10-05',
      ...extra,
    };
  }

  async function messages(): Promise<string[]> {
    const rows = await prisma.conversationMessage.findMany({
      where: { conversation: { userId: studentId } },
      orderBy: { createdAt: 'asc' },
      select: { body: true },
    });
    return rows.map((row) => row.body);
  }

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();
    adminId = (
      await prisma.user.create({
        data: { id: `courier-admin-${stamp}`, name: 'أدمن', email: `courier-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: { id: `courier-student-${stamp}`, name: 'طالب', email: `courier-student-${stamp}@t.test` },
      })
    ).id;
  });

  beforeEach(() => {
    sent.length = 0;
    shippedIds.length = 0;
    refuseWith = null;
  });

  afterAll(async () => {
    await prisma.bookOrder.deleteMany({ where: { id: { in: created } } });
    await prisma.notification.deleteMany({ where: { userId: studentId } });
    await prisma.conversation.deleteMany({ where: { userId: studentId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, studentId] } } });
    await prisma.$disconnect();
  });

  describe('sendMany', () => {
    it('hands a printed order to the courier and records it «اتشحن»', async () => {
      const id = await order('printing');
      const result = await service.sendMany(adminId, [id]);

      expect(result.rows[0]).toMatchObject({ outcome: 'sent_to_courier' });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ sender_UID: id, city_Name: 'القاهرة', area_Name: 'مدينة نصر', order_Amt: 0 });
      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id } });
      // «لما المطبعة تخلص ببعت لشركة الشحن» — and that IS «اتشحن».
      expect(row.status).toBe('shipped');
      expect(row.courierSentAt).not.toBeNull();
      expect(shippedIds).toEqual([id]);
    });

    it('never sends the same order twice', async () => {
      const id = await order('printing');
      await service.sendMany(adminId, [id]);
      const again = await service.sendMany(adminId, [id, id]);

      expect(sent).toHaveLength(1);
      expect(again.rows.map((row) => row.reason)).toEqual(['اتبعت لشركة الشحن قبل كده', 'اتبعت لشركة الشحن قبل كده']);
    });

    it('releases the claim on a refusal and keeps their words', async () => {
      const id = await order('printing');
      refuseWith = 'المنطقة غير موجودة';
      const refused = await service.sendMany(adminId, [id]);

      expect(refused.rows[0]).toMatchObject({ outcome: 'skipped', reason: 'شركة الشحن رفضته: المنطقة غير موجودة' });
      let row = await prisma.bookOrder.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: 'printing', courierSentAt: null, courierError: 'المنطقة غير موجودة' });
      // Refused by the courier → not shipped either.
      expect(shippedIds).toEqual([]);

      refuseWith = null;
      await service.sendMany(adminId, [id]);
      row = await prisma.bookOrder.findUniqueOrThrow({ where: { id } });
      expect(row.courierSentAt).not.toBeNull();
      expect(row.courierError).toBeNull();
    });

    it('skips a held order by name', async () => {
      const id = await order('printing');
      await prisma.bookOrder.update({
        where: { id },
        data: { heldForReviewAt: new Date(), heldReason: 'amount_short' },
      });
      const result = await service.sendMany(adminId, [id]);
      expect(result.rows[0]).toMatchObject({ outcome: 'skipped', reason: 'محجوز للمراجعة' });
      expect(sent).toHaveLength(0);
    });

    it('refuses outright when the stack has no courier account', async () => {
      const unconfigured = new BookOrderCourierService(prisma, audit, notifications, outreach, bookOrders, {
        ...torod,
        credentials: () => null,
      } as unknown as TorodClient);
      await expect(unconfigured.sendMany(adminId, [await order('printing')])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('ingest (the webhook)', () => {
    it('«مع المندوب» ships the order and tells the student who is coming', async () => {
      await prisma.conversation.deleteMany({ where: { userId: studentId } });
      const id = await order('printing', true);
      const result = await service.ingest([report(id, 3, { status_Name: 'في الشحن مع المندوب' })]);

      expect(result).toEqual({ applied: 1, ignored: 0 });
      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({
        status: 'shipped',
        shippedByUserId: null,
        courierStatusId: 3,
        courierAgentName: 'محمد',
        courierRef: '2235',
      });
      expect(row.shippedAt).not.toBeNull();
      const [message] = await messages();
      expect(message).toContain('محمد');
      expect(message).toContain('0100000000');
      expect(
        await prisma.notification.count({ where: { userId: studentId, kind: 'book_order_shipped' } }),
      ).toBeGreaterThan(0);
    });

    it('is a no-op for a report it has already seen', async () => {
      await prisma.conversation.deleteMany({ where: { userId: studentId } });
      const id = await order('printing', true);
      await service.ingest([report(id, 3)]);
      const again = await service.ingest([report(id, 3)]);

      expect(again).toEqual({ applied: 0, ignored: 1 });
      expect(await prisma.bookOrderCourierEvent.count({ where: { orderId: id } })).toBe(1);
      expect(await messages()).toHaveLength(1);
    });

    it('«تسليم ناجح» closes the order', async () => {
      const id = await order('printing', true);
      await service.ingest([report(id, 3), report(id, 4, { status_Name: 'تم التسليم' })]);
      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: 'delivered', deliveredByUserId: null, courierStatusName: 'تم التسليم' });
      expect((await service.events(id)).map((event) => event.statusId)).toEqual([3, 4]);
    });

    it('«مؤجل» and «مرتجع» leave the status alone and message the student with their note', async () => {
      await prisma.conversation.deleteMany({ where: { userId: studentId } });
      const id = await order('shipped');
      await service.ingest([
        report(id, 6, { status_Note: 'العميل مش موجود' }),
        report(id, 5, { status_Note: 'رفض الاستلام' }),
      ]);
      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: 'shipped', courierStatusId: 5 });
      const [postponed, returned] = await messages();
      expect(postponed).toContain('أجّلت');
      expect(postponed).toContain('العميل مش موجود');
      expect(returned).toContain('رجعت');
      expect(returned).toContain('رفض الاستلام');
    });

    it('records but ignores an order it does not know, and one entry it cannot read', async () => {
      const result = await service.ingest([
        report('0199a0b1-2c3d-7e4f-8a9b-000000000000', 3),
        { sender_UID: 'x' },
        'nonsense',
      ]);
      expect(result).toEqual({ applied: 0, ignored: 3 });
    });

    it('does not resurrect a deleted order', async () => {
      const id = await order('printing', true);
      await prisma.bookOrder.update({
        where: { id },
        data: { deletedAt: new Date(), deletedByUserId: adminId, deletionReason: 'تكرار' },
      });
      await service.ingest([report(id, 4)]);
      const row = await prisma.bookOrder.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('printing');
      expect(row.courierStatusId).toBe(4);
    });
  });
});
