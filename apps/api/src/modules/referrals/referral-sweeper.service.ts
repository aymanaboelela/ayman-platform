import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isFeatureEnabled } from '../../common/entitlements';
import { ReferralsService } from './referrals.service';

/** Per page of candidates. */
const PAGE = 100;
/** Per tick, across pages — a bound on one minute's work, not a quota. */
const MAX_PER_TICK = 500;

/**
 * «دعوة الصحاب» — every minute: pay the referrals whose friend has paid, and
 * take back the ones whose triggering payment was refunded.
 *
 * Why a sweep and not a hook on each approval: see `ReferralsService`'s
 * header. Everything here is safe to run twice — `reward()` and
 * `reverseForRefund()` each move a referral with a conditional UPDATE and are
 * no-ops on a row that already moved.
 *
 * A failure on one referral is logged and the sweep moves on: one malformed
 * row must not hold every other student's reward hostage.
 */
@Injectable()
export class ReferralSweeper {
  private readonly logger = new Logger(ReferralSweeper.name);
  private running = false;

  constructor(private readonly referrals: ReferralsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<{ credited: number; blocked: number; reversed: number }> {
    // One pass at a time in this process; a slow minute must not overlap the
    // next. Across replicas the conditional UPDATEs are what keep it correct.
    if (this.running) return { credited: 0, blocked: 0, reversed: 0 };
    this.running = true;
    try {
      // Reversals first, and regardless of the switches: money that should
      // come back comes back even if the program was turned off since.
      const reversed = await this.reverseRefunded();
      if (!isFeatureEnabled('referrals')) return { credited: 0, blocked: 0, reversed };
      const { credited, blocked } = await this.rewardPaid();
      if (credited + blocked + reversed > 0) {
        this.logger.log({ credited, blocked, reversed }, 'referral sweep');
      }
      return { credited, blocked, reversed };
    } finally {
      this.running = false;
    }
  }

  private async rewardPaid(): Promise<{ credited: number; blocked: number }> {
    let credited = 0;
    let blocked = 0;
    let seen = 0;
    let after: string | null = null;
    while (seen < MAX_PER_TICK) {
      const ids = await this.referrals.rewardCandidates(after, PAGE);
      if (ids.length === 0) break;
      for (const id of ids) {
        try {
          const outcome = await this.referrals.reward(id);
          if (outcome === 'credited') credited += 1;
          if (outcome === 'blocked') blocked += 1;
        } catch (error) {
          this.referrals.logFailure('reward', id, error);
        }
      }
      seen += ids.length;
      after = ids[ids.length - 1]!;
      if (ids.length < PAGE) break;
    }
    return { credited, blocked };
  }

  private async reverseRefunded(): Promise<number> {
    let reversed = 0;
    const ids = await this.referrals.refundedCandidates(PAGE);
    for (const id of ids) {
      try {
        if (await this.referrals.reverseForRefund(id)) reversed += 1;
      } catch (error) {
        this.referrals.logFailure('reversal', id, error);
      }
    }
    return reversed;
  }
}
