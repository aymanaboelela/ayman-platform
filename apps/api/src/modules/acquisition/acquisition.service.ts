import { Injectable, NotFoundException } from '@nestjs/common';
import type { AcquisitionClaim, AcquisitionClaimOutcome } from '@ayman/contracts/acquisition';
import {
  ACQUISITION_AFTER_SIGNUP_GRACE_SECONDS,
  ACQUISITION_CLAIM_WINDOW_SECONDS,
  ACQUISITION_TOUCH_TTL_SECONDS,
} from '@ayman/contracts/acquisition-touch';
import {
  ACQUISITION_REPORT_MAX_ROWS,
  type AcquisitionReport,
  type AcquisitionReportQuery,
} from '@ayman/contracts/admin/acquisition';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { cairoDay } from '../analytics/analytics-shared';
import { subscriptionCashSql } from '../payments/subscription-cash';

/** `SUBSCRIPTION_CASH_WHERE` over alias `p`. A constant, never request data —
 *  the same argument `FinanceOverviewService` makes for its own copy. */
const SUBSCRIPTION_CASH_RAW = Prisma.raw(subscriptionCashSql('p'));

interface ReportDbRow {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  signups: number;
  paid: number;
  revenue: bigint | number;
  total_campaigns: number;
  total_signups: number;
  total_paid: number;
  total_revenue: bigint | number;
}

/**
 * «الحساب ده جه منين» — writing the first touch once, and reading it back as
 * «الحملة دي جابت كام».
 *
 * ## Why a route and not the sign-up hook
 *
 * «دعوة الصحاب» attributes inside `databaseHooks.user.create.after`, off an
 * httpOnly cookie its own `/r/<code>` route sets. A first touch has no such
 * route: it is on the URL of a public page, and those responses are
 * edge-cacheable with no per-request `Set-Cookie` (`proxy.ts`). Reaching the
 * hook would take a cookie written by script — a stranger's strings riding
 * every request to this origin for a month. So the browser keeps the touch to
 * itself and hands it over once, with a session; the price is that the rule a
 * hook gets for free («only at creation») is spelled out in `claim` instead.
 */
@Injectable()
export class AcquisitionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes the account's first touch, or says why not. Never throws for a
   * refusal — see `AcquisitionClaimOutcomeSchema` for why those are answers.
   *
   * The checks run cheapest-and-most-final first, and none of them trusts the
   * body for anything but the touch itself: the account and its age come from
   * the session and the database.
   */
  async claim(userId: string, touch: AcquisitionClaim, now: Date = new Date()): Promise<AcquisitionClaimOutcome> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, acquisition: { select: { userId: true } } },
    });
    // A session whose account was deleted between the guard and here.
    if (!user) throw new NotFoundException();

    if (user.acquisition) return 'exists';

    const accountAgeMs = now.getTime() - user.createdAt.getTime();
    if (accountAgeMs > ACQUISITION_CLAIM_WINDOW_SECONDS * 1000) return 'account_too_old';

    if (touch.ageSeconds > ACQUISITION_TOUCH_TTL_SECONDS) return 'touch_expired';

    /*
     * The touch, placed on THIS clock. A click made after the account existed
     * did not bring the account in — without this, anyone still inside the
     * window above could open an ad link and be counted as its sign-up.
     */
    const firstTouchAt = new Date(now.getTime() - touch.ageSeconds * 1000);
    const latestAllowed = user.createdAt.getTime() + ACQUISITION_AFTER_SIGNUP_GRACE_SECONDS * 1000;
    if (firstTouchAt.getTime() > latestAllowed) return 'touch_after_signup';

    try {
      await this.prisma.userAcquisition.create({
        data: {
          userId,
          source: touch.source,
          medium: touch.medium,
          campaign: touch.campaign,
          content: touch.content,
          term: touch.term,
          fbclid: touch.fbclid,
          landingPath: touch.landingPath,
          firstTouchAt,
        },
      });
    } catch (error) {
      // Two tabs finishing the same sign-up: the primary key picked one.
      if (isUniqueViolation(error)) return 'exists';
      throw error;
    }
    return 'recorded';
  }

  /**
   * One row per (source, medium, campaign), most sign-ups first.
   *
   * `@ayman/contracts/admin/acquisition`'s header says what the window, «دفع»
   * and «الإيراد» mean; this is the SQL that has to agree with it. One
   * statement, so the totals and the rows cannot describe two different sets —
   * the totals are window functions over every group, taken BEFORE the cap.
   */
  async report(query: AcquisitionReportQuery): Promise<AcquisitionReport> {
    // The account's Cairo day — see `cairoDay` for why never a bare AT TIME ZONE.
    const createdDay = cairoDay('u."created_at"');
    const from = query.from === undefined ? Prisma.empty : Prisma.sql`AND ${createdDay} >= ${query.from}`;
    const to = query.to === undefined ? Prisma.empty : Prisma.sql`AND ${createdDay} <= ${query.to}`;

    const rows = await this.prisma.$queryRaw<ReportDbRow[]>(Prisma.sql`
      WITH att AS (
        SELECT a."user_id",
               /* A click that carried only fbclid still came from Facebook. */
               COALESCE(a."source", CASE WHEN a."fbclid" IS NOT NULL THEN 'facebook' END) AS source,
               a."medium" AS medium,
               a."campaign" AS campaign
        FROM "app"."user_acquisition" a
        JOIN "app"."users" u ON u."id" = a."user_id"
        WHERE TRUE ${from} ${to}
      ),
      /* A row here is «paid» the way FinanceService counts it: approved and
         not comped, wallet-funded included. Only the SUM leaves the wallet
         ones out, because their money is in wal below. */
      subs AS (
        SELECT p."user_id",
               COALESCE(SUM(p."amount_cents") FILTER (WHERE ${SUBSCRIPTION_CASH_RAW}), 0) AS cash
        FROM "app"."payment_submissions" p
        JOIN att ON att."user_id" = p."user_id"
        WHERE p."status" = 'approved' AND p."is_free" = false
        GROUP BY p."user_id"
      ),
      /* WALLET_INCOME_WHERE. Signed, so a paid credit taken back comes off. */
      wal AS (
        SELECT w."user_id", SUM(w."amount_cents") AS income
        FROM "app"."wallet_transactions" w
        JOIN att ON att."user_id" = w."user_id"
        WHERE w."counts_as_income" = true
        GROUP BY w."user_id"
      ),
      grouped AS (
        SELECT att.source, att.medium, att.campaign,
               COUNT(*)::int AS signups,
               COUNT(subs."user_id")::int AS paid,
               /* ::bigint — a SUM of bigints is numeric, which the driver hands back as a Decimal. */
               COALESCE(SUM(COALESCE(subs.cash, 0) + COALESCE(wal.income, 0)), 0)::bigint AS revenue
        FROM att
        LEFT JOIN subs ON subs."user_id" = att."user_id"
        LEFT JOIN wal ON wal."user_id" = att."user_id"
        GROUP BY att.source, att.medium, att.campaign
      )
      SELECT g.*,
             COUNT(*) OVER ()::int AS total_campaigns,
             SUM(g.signups) OVER ()::int AS total_signups,
             SUM(g.paid) OVER ()::int AS total_paid,
             SUM(g.revenue) OVER ()::bigint AS total_revenue
      FROM grouped g
      ORDER BY g.signups DESC, g.paid DESC, g.source NULLS LAST, g.medium NULLS LAST, g.campaign NULLS LAST
      LIMIT ${ACQUISITION_REPORT_MAX_ROWS}
    `);

    const first = rows[0];
    return {
      from: query.from ?? null,
      to: query.to ?? null,
      rows: rows.map((row) => ({
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        signups: row.signups,
        paid: row.paid,
        // Postgres SUMs arrive as bigint; piastres fit a double many times over.
        revenueCents: Number(row.revenue),
      })),
      totals: {
        campaigns: first?.total_campaigns ?? 0,
        signups: first?.total_signups ?? 0,
        paid: first?.total_paid ?? 0,
        revenueCents: Number(first?.total_revenue ?? 0),
      },
    };
  }
}
