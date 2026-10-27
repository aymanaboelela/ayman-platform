import { randomUUID } from 'node:crypto';
import { OutreachSettingsSchema } from '@ayman/contracts/admin/settings';
import { PrismaService } from '../../prisma/prisma.service';
import { AutoOutreachCandidates } from './auto-outreach-candidates.service';
import { CheckoutIntentsService } from './checkout-intents.service';

/**
 * WHO the automatic WhatsApp messages would go to, against a real database —
 * the queries the rules spec cannot reach: the paid-access `none` filter, the
 * pending-claim exclusion, the platform-grant trap, and the deep link the
 * intent write builds.
 *
 * Every assertion is about the fixture students only (`mine`), because CI's
 * database is shared with every other suite in the run.
 */

const HOUR = 60 * 60 * 1000;
const settings = OutreachSettingsSchema.parse({});

describe('AutoOutreachCandidates (real database)', () => {
  let prisma: PrismaService;
  let candidates: AutoOutreachCandidates;
  let intents: CheckoutIntentsService;

  const adminId = randomUUID();
  const fresh = randomUUID(); // signed up 30h ago, bought nothing
  const platformOnly = randomUUID(); // signed up 30h ago, only the platform grant
  const paid = randomUUID(); // signed up 30h ago, holds a course grant
  const pending = randomUUID(); // signed up 30h ago, transfer in review
  const old = randomUUID(); // signed up a month ago — the campaign's backlog
  const shopper = randomUUID(); // opened a checkout 4h ago
  let courseId = '';
  let courseSlug = '';

  const fixture: string[] = [fresh, platformOnly, paid, pending, old, shopper];
  const mine = (ids: string[]) => ids.filter((id) => fixture.includes(id));

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    candidates = new AutoOutreachCandidates(prisma);
    intents = new CheckoutIntentsService(prisma);

    const thirtyHours = new Date(Date.now() - 30 * HOUR);
    await prisma.user.createMany({
      data: [
        { id: adminId, name: 'Auto Admin', email: `${adminId}@example.test`, role: 'admin' },
        ...[fresh, platformOnly, paid, pending, shopper].map((id) => ({
          id,
          name: 'طالب تجربة',
          email: `${id}@example.test`,
          role: 'student',
          createdAt: thirtyHours,
        })),
        {
          id: old,
          name: 'طالب قديم',
          email: `${old}@example.test`,
          role: 'student',
          createdAt: new Date(Date.now() - 30 * 24 * HOUR),
        },
      ],
    });

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();
    courseSlug = `auto-outreach-${randomUUID()}`;
    const course = await prisma.course.create({
      data: {
        slug: courseSlug,
        title: 'كورس للبيع',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: adminId,
        requiresGrant: true,
        monthlyPriceCents: 15000,
      },
    });
    courseId = course.id;

    await prisma.accessGrant.createMany({
      data: [
        { userId: platformOnly, scope: 'platform', source: 'auto_free' },
        { userId: paid, scope: 'course', courseId, source: 'purchase' },
      ],
    });
    await prisma.paymentSubmission.create({
      data: { userId: pending, courseId, plan: 'monthly', amountCents: 15000, status: 'pending' },
    });
  });

  afterAll(async () => {
    await prisma.checkoutIntent.deleteMany({ where: { userId: { in: [shopper, fresh] } } });
    await prisma.paymentSubmission.deleteMany({ where: { courseId } });
    await prisma.accessGrant.deleteMany({ where: { userId: { in: [platformOnly, paid] } } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, fresh, platformOnly, paid, pending, old, shopper] } },
    });
    await prisma.$disconnect();
  });

  it('nudges the new accounts that bought nothing — the platform grant does not count as buying', async () => {
    const due = await candidates.signupDue(new Date(), settings);
    const users = mine(due.map((d) => d.input.userId));
    expect(users).toEqual(expect.arrayContaining([fresh, platformOnly]));
    expect(users).not.toContain(paid);
    expect(users).not.toContain(pending);
    // A month-old account is the campaign's backlog, never the sweeper's.
    expect(users).not.toContain(old);
    for (const item of due.filter((d) => d.input.userId === fresh)) {
      expect(item.input.dedupeKey).toBe('step1');
      expect(item.input.facts).toMatchObject({ kind: 'signup_nudge', step: 1 });
    }
  });

  it('builds the deep link itself, and keeps only months of this course', async () => {
    await intents.record(shopper, { target: 'course', targetId: courseId, monthIds: [randomUUID()] });
    const row = await prisma.checkoutIntent.findUniqueOrThrow({
      where: { userId_target_targetId: { userId: shopper, target: 'course', targetId: courseId } },
    });
    expect(row.path).toBe(`/courses/${courseSlug}/subscribe`);
  });

  it('reminds an abandoned checkout after the delay, and lets the checkout win over the welcome', async () => {
    await prisma.checkoutIntent.update({
      where: { userId_target_targetId: { userId: shopper, target: 'course', targetId: courseId } },
      data: { openedAt: new Date(Date.now() - 4 * HOUR) },
    });

    const checkout = await candidates.checkoutDue(new Date(), settings);
    const reminder = checkout.find((d) => d.input.userId === shopper);
    expect(reminder?.input.facts).toMatchObject({ kind: 'checkout_recovery', target: 'course', title: 'كورس للبيع' });
    expect((reminder?.input.facts as { url: string }).url.endsWith(`/courses/${courseSlug}/subscribe`)).toBe(true);

    const signup = await candidates.signupDue(new Date(), settings);
    expect(mine(signup.map((d) => d.input.userId))).not.toContain(shopper);
  });

  it('does not remind a checkout once a transfer for it is waiting', async () => {
    const submission = await prisma.paymentSubmission.create({
      data: { userId: shopper, courseId, plan: 'monthly', amountCents: 15000, status: 'pending' },
    });
    const checkout = await candidates.checkoutDue(new Date(), settings);
    expect(mine(checkout.map((d) => d.input.userId))).not.toContain(shopper);
    await prisma.paymentSubmission.delete({ where: { id: submission.id } });
  });

  it('refuses an intent for a course that is not on sale, writing nothing', async () => {
    await expect(
      intents.record(fresh, { target: 'course', targetId: randomUUID(), monthIds: [] }),
    ).rejects.toThrow('course not found');
    expect(await prisma.checkoutIntent.count({ where: { userId: fresh } })).toBe(0);
  });
});
