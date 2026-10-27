import { Injectable, NotFoundException } from '@nestjs/common';
import type { CheckoutIntentInput } from '@ayman/contracts/outreach/auto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * «فتح خطوة الدفع» — the write half of checkout recovery.
 *
 * ## The link is built here, from the target, and nowhere else
 *
 * The reminder puts this path into a WhatsApp message from the instructor's
 * own number. So the browser names WHAT it opened (a course id, an order id,
 * the months it was buying) and this service decides WHERE that lives:
 *
 *   course      `/courses/<slug>/subscribe[?month=a,b]` — the checkout route
 *               that exists precisely so a link can open it (its own note in
 *               `(site)/courses/[slug]/subscribe/page.tsx`);
 *   book order  `/store/orders/<id>/pay` — the «كمّل الدفع» page.
 *
 * A target the student cannot buy (an unknown or unpublished course, someone
 * else's order, an order already paid) is a 404 and writes nothing: an intent
 * that can never be abandoned is a row the sweeper would re-read forever.
 */
@Injectable()
export class CheckoutIntentsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, input: CheckoutIntentInput): Promise<void> {
    const path =
      input.target === 'course'
        ? await this.coursePath(input.targetId, input.monthIds)
        : await this.bookOrderPath(userId, input.targetId);

    const now = new Date();
    /*
     * Upsert, and reopening moves `openedAt` forward. The reminder's clock
     * starts from the LAST time the student was on the page: someone who comes
     * back an hour later and leaves again is still deciding, and three hours
     * from the first visit would reach them mid-thought.
     *
     * `remindedAt` is left alone on update, which is what lets `checkoutDue`
     * tell "reminded about this opening" from "reopened since the reminder".
     */
    await this.prisma.checkoutIntent.upsert({
      where: { userId_target_targetId: { userId, target: input.target, targetId: input.targetId } },
      create: { userId, target: input.target, targetId: input.targetId, path, openedAt: now },
      update: { path, openedAt: now },
    });
  }

  private async coursePath(courseId: string, monthIds: readonly string[]): Promise<string> {
    const course = await this.prisma.course.findFirst({
      // Only a course that is actually sold. A free course has no payment step
      // to abandon, and `courses_priced_requires_grant` makes `requiresGrant`
      // the honest test for "has a price".
      where: { id: courseId, status: 'published', requiresGrant: true },
      select: { slug: true },
    });
    if (!course) throw new NotFoundException('course not found');

    const base = `/courses/${encodeURIComponent(course.slug)}/subscribe`;
    if (monthIds.length === 0) return base;

    // Ids from a URL anybody can type: only months of THIS course survive,
    // which is the same filter `requestedMonthIds` applies in the panel.
    const months = await this.prisma.courseMonth.findMany({
      where: { courseId, id: { in: [...monthIds] } },
      orderBy: { monthIndex: 'asc' },
      select: { id: true },
    });
    return months.length > 0 ? `${base}?month=${months.map((m) => m.id).join(',')}` : base;
  }

  private async bookOrderPath(userId: string, orderId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true },
    });
    /*
     * Ownership exactly as «طلباتي» reads it (`BookOrdersService.listMine`):
     * the account's own rows, or an UNCLAIMED guest row on the account's phone.
     * Anything else is someone else's order and does not exist here.
     */
    const order = await this.prisma.bookOrder.findFirst({
      where: {
        id: orderId,
        deletedAt: null,
        status: 'address_only',
        OR: [{ userId }, ...(user?.phoneNumber ? [{ userId: null, phone: user.phoneNumber }] : [])],
      },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('order not found');
    return `/store/orders/${order.id}/pay`;
  }
}
