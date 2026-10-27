import { REFERRAL_PROGRAM_DEFAULTS, type ReferralProgram } from '@ayman/contracts/admin/referrals';
import { isFeatureEnabled } from '../../common/entitlements';
import { isUniqueViolation } from '../../common/prisma/prisma-errors';
import type { Prisma } from '../../generated/prisma/client';
import { clickWithinWindow, referralClickFromCookieHeader } from './referral-rules';

/**
 * The program row, or its defaults (OFF) when no admin ever saved one.
 *
 * Takes any client with the model, not `PrismaService`: the sign-up hook in
 * `auth.config.ts` runs before Nest's container exists and holds a plain
 * `PrismaClient` of its own.
 */
export async function readReferralProgram(
  client: Pick<Prisma.TransactionClient, 'referralProgram'>,
): Promise<ReferralProgram> {
  const row = await client.referralProgram.findUnique({ where: { id: 1 } });
  if (!row) return { ...REFERRAL_PROGRAM_DEFAULTS };
  return {
    enabled: row.enabled,
    referrerRewardCents: row.referrerRewardCents,
    friendRewardCents: row.friendRewardCents,
    monthlyCap: row.monthlyCap,
    windowDays: row.windowDays,
    whatsappNotice: row.whatsappNotice,
  };
}

export type AttributionOutcome =
  | 'attributed'
  | 'no-click'
  | 'feature-off'
  | 'program-off'
  | 'expired'
  | 'unknown-code'
  | 'self'
  | 'already';

/**
 * «الحساب ده جه من لينك مين؟» — run once, right after better-auth writes a new
 * user, from `databaseHooks.user.create.after`.
 *
 * ## Once, and never again
 *
 * A user is created once, and `referrals.referred_user_id` is UNIQUE — so an
 * existing account can never be re-attributed, whatever links it clicks
 * later. The LAST click inside the window wins because the `/r/<code>` route
 * rewrites the cookie on every click; this only reads what is there.
 *
 * ## Never in the way of a sign-up
 *
 * Every failure is swallowed by the caller and logged: a student who cannot
 * register because a referral lookup timed out is a worse outcome than a
 * friend attributed to nobody. Nothing here moves money — that waits for a
 * real payment (`ReferralsService.reward`).
 */
export async function attributeSignup(
  client: Pick<Prisma.TransactionClient, 'referralProgram' | 'referralCode' | 'referral'>,
  input: { userId: string; cookieHeader: string | null | undefined; now?: Date },
): Promise<AttributionOutcome> {
  const click = referralClickFromCookieHeader(input.cookieHeader);
  if (!click) return 'no-click';
  if (!isFeatureEnabled('referrals')) return 'feature-off';

  const program = await readReferralProgram(client);
  if (!program.enabled) return 'program-off';
  if (!clickWithinWindow(click.clickedAt, input.now ?? new Date(), program.windowDays)) return 'expired';

  const owner = await client.referralCode.findUnique({
    where: { code: click.code },
    select: { userId: true },
  });
  if (!owner) return 'unknown-code';
  if (owner.userId === input.userId) return 'self';

  try {
    await client.referral.create({
      data: { referrerUserId: owner.userId, referredUserId: input.userId, code: click.code },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'already';
    throw error;
  }
  return 'attributed';
}
