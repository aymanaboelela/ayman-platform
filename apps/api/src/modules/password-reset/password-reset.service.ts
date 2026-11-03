import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  PASSWORD_RESET_LIMITS,
  type PasswordResetConfirmResult,
  type PasswordResetRequestResult,
} from '@ayman/contracts/password-reset';
import { ARGON2_OPTIONS } from '../../auth/argon2-options';
import {
  accountThrottleKey,
  emailIdentifier,
  phoneIdentifier,
  throttleKeyFor,
} from '../../auth/credential-check.service';
import { createTurnstileCheck, type HumanCheck } from '../../auth/human-check';
import { loginThrottle } from '../../auth/login-throttle.instance';
import { AuditService } from '../../audit/audit.service';
import { isFeatureEnabled } from '../../common/entitlements';
import { loadEnv } from '../../config/env';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappDeviceService } from '../marketing/whatsapp-device.service';
import { codeMatches, generateCode, hashCode, renderMessage } from './password-reset-code';

/**
 * «نسيت كلمة السر» — a six-digit code on WhatsApp from the stack's linked
 * number, then a new password.
 *
 * ## Why this is not Better Auth's phone OTP
 *
 * That plugin is wired and its four routes are CLOSED
 * (`OTP_PATHS_WITHOUT_DELIVERY`), and the reason they are closed is the reason
 * this is separate: it writes a usable code BEFORE it calls `sendOTP`, keeps
 * it in plain text, and answers `/request-password-reset` differently for a
 * number it knows. Making it safe would mean wrapping all three of those from
 * outside a library whose internals are not ours to pin. Here the order is the
 * other way round by construction — see `deliver()` — and the routes stay
 * closed.
 *
 * ## The two halves, and why the line between them is where it is
 *
 * `request()` answers the browser. It does only what is the same for every
 * number: the human check, whether the STACK can send at all, the limits
 * (which count every request, registered or not) and one insert. Then it
 * answers `accepted` — for a student, for a made-up number, for a Google-only
 * account alike.
 *
 * `deliver()` runs after that answer has left, on its own turn of the event
 * loop. It is the first code that asks whether an account owns the number, so
 * nothing it does — the lookup, the send, a failure, WhatsApp being slow —
 * can change what the browser saw or how long it waited. There is no sleep
 * anywhere in this file: equal timing comes from there being nothing
 * per-account on the request path to time, not from padding (a padded login
 * was found to be a DoS primitive — every attempt held a socket open).
 *
 * ## What protects the number
 *
 * The linked number is the instructor's own WhatsApp account, warming up, and
 * a code to a student who never wrote to it is a NEW chat — the thing
 * WhatsApp restricts and bans personal accounts for. So, in order:
 *
 *   1. only a registered STUDENT's number is ever messaged — a made-up number,
 *      a staff account and a banned one get the same `accepted` and nothing;
 *   2. Turnstile, before anything is counted;
 *   3. the device must be connected and NOT under a new-chat restriction, and
 *      the number's own new-chat quota must have room — refused for everyone
 *      before the wire, the rule `new-chat-limits.mjs` states;
 *   4. per number: one request a minute, 3 an hour, 5 a day; per client: 6
 *      an hour, 20 a day;
 *   5. for the whole stack: 30 requests an hour and 120 a day, past which
 *      everybody is told the sending is off — and, separately and invisibly,
 *      8 codes an hour and 25 a day actually SENT, under the warm-up ramp's
 *      floor of 40 so campaigns and notices keep their room; then the
 *      device's own daily ceiling on top, which `send()` enforces.
 *
 * The two stack-wide caps are split on purpose: see `requestsPerDay` in
 * `@ayman/contracts/password-reset` for the oracle a visible sends cap is.
 */

export interface PasswordResetOptions {
  /** Overrides for specs; production uses `PASSWORD_RESET_LIMITS` as-is. */
  limits?: Partial<Record<keyof typeof PASSWORD_RESET_LIMITS, number>>;
  /** The HMAC key. Defaults to `BETTER_AUTH_SECRET`. */
  secret?: string;
  /** `null` = no Turnstile on this stack. Defaults to `TURNSTILE_SECRET_KEY`. */
  humanCheck?: HumanCheck | null;
}

export const PASSWORD_RESET_OPTIONS = Symbol('PASSWORD_RESET_OPTIONS');

export type RequestOutcome =
  | PasswordResetRequestResult
  | { status: 'limited'; retryAfterSeconds: number }
  | { status: 'human_check' };

export type ConfirmOutcome = PasswordResetConfirmResult | { status: 'invalid' };

export interface RequestInput {
  /** E.164 — the DTO has already normalised it. */
  phone: string;
  /** `clientIpFromRequest`, for the per-client limits. */
  ipBucket: string;
  /** The raw `cf-connecting-ip`, for Turnstile's `remoteip`. */
  remoteIp: string | null;
  captchaToken: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Leave this many of WhatsApp's new-chat quota untouched. A code is not worth
 * the LAST new chat the number is allowed — a campaign reply or a shipping
 * notice to someone who asked for it is.
 */
const NEW_CHAT_RESERVE = 3;

/**
 * Every request serialises on this, so two simultaneous requests cannot both
 * read "2 sent this hour" and both send the third. `hashtext` of a fixed
 * label, so the key is stable and cannot collide with the audit chain's.
 */
const LOCK_LABEL = 'password_reset_requests';

/** Statuses that mean a message was (or was about to be) put on the wire. */
const SEND_STATUSES = ['sending', 'sent', 'failed', 'used', 'spent', 'superseded'] as const;

interface Counts {
  phone_hour: number;
  phone_day: number;
  phone_last: Date | null;
  phone_first_hour: Date | null;
  phone_first_day: Date | null;
  ip_hour: number;
  ip_day: number;
  ip_first_hour: Date | null;
  ip_first_day: Date | null;
  all_hour: number;
  all_day: number;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly limits: typeof PASSWORD_RESET_LIMITS;
  private readonly secret: string;
  private readonly humanCheck: HumanCheck | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly device: WhatsappDeviceService,
    private readonly audit: AuditService,
    @Optional() @Inject(PASSWORD_RESET_OPTIONS) options?: PasswordResetOptions,
  ) {
    this.limits = { ...PASSWORD_RESET_LIMITS, ...(options?.limits ?? {}) } as typeof PASSWORD_RESET_LIMITS;
    const env = options?.secret && options.humanCheck !== undefined ? null : loadEnv(process.env);
    this.secret = options?.secret ?? env!.BETTER_AUTH_SECRET;
    this.humanCheck =
      options?.humanCheck !== undefined
        ? options.humanCheck
        : env!.TURNSTILE_SECRET_KEY
          ? createTurnstileCheck(env!.TURNSTILE_SECRET_KEY)
          : null;
  }

  /**
   * The browser's half. Resolves with what to answer and, when a row was
   * written, the delivery already scheduled behind it — returned so a spec can
   * await it. The controller never does.
   */
  async request(input: RequestInput, now = new Date()): Promise<{ outcome: RequestOutcome; delivery: Promise<void> | null }> {
    if (this.humanCheck && !(await this.humanCheck.verify(input.captchaToken, input.remoteIp))) {
      return { outcome: { status: 'human_check' }, delivery: null };
    }

    if (!(await this.stackCanSend())) return { outcome: { status: 'unavailable' }, delivery: null };

    const decided = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_LABEL}))`;
      const counts = await this.counts(tx, input.phone, input.ipBucket, now);

      const limited = this.retryAfter(counts, now);
      if (limited !== null) return { kind: 'limited' as const, retryAfterSeconds: limited };

      // The stack-wide REQUEST caps are a fact about the stack, so they read
      // as «إرسال الكود واقف» to everyone, before any account is looked at.
      // Counted over every row, never over sends — see `requestsPerDay`.
      if (counts.all_hour >= this.limits.requestsPerHour || counts.all_day >= this.limits.requestsPerDay) {
        return { kind: 'unavailable' as const };
      }

      const row = await tx.passwordResetRequest.create({
        data: {
          phone: input.phone,
          ipBucket: input.ipBucket.slice(0, 64),
          status: 'queued',
          // A placeholder until a code exists; `deliver()` restarts the clock
          // at the moment the message actually leaves.
          expiresAt: new Date(now.getTime() + this.limits.codeTtlSeconds * 1000),
          createdAt: now,
        },
        select: { id: true },
      });
      return { kind: 'accepted' as const, id: row.id };
    });

    if (decided.kind === 'limited') {
      return { outcome: { status: 'limited', retryAfterSeconds: decided.retryAfterSeconds }, delivery: null };
    }
    if (decided.kind === 'unavailable') return { outcome: { status: 'unavailable' }, delivery: null };

    // `setImmediate`, not a bare call: the first `await` inside `deliver`
    // would otherwise run on THIS turn, before the response is written.
    const delivery = new Promise<void>((resolve) => {
      setImmediate(() => {
        this.deliver(decided.id)
          .catch((error: unknown) => this.logger.error({ err: error }, 'password reset delivery crashed'))
          .finally(resolve);
      });
    });
    return { outcome: { status: 'accepted' }, delivery };
  }

  /**
   * Whether this stack can put a code on the wire right now — identical for
   * every caller, so saying no reveals nothing about any account.
   *
   * `status()` never throws (an unreachable sidecar is a state, not an error)
   * and is bounded at 4 s.
   */
  private async stackCanSend(): Promise<boolean> {
    if (!isFeatureEnabled('marketing.whatsapp') || !this.device.enabled) return false;
    const device = await this.device.status();
    if (device.state !== 'connected') return false;
    const limits = device.limits;
    if (limits?.restricted) return false;
    if (
      limits &&
      typeof limits.quotaTotal === 'number' &&
      typeof limits.quotaUsed === 'number' &&
      limits.quotaTotal - limits.quotaUsed <= NEW_CHAT_RESERVE
    ) {
      return false;
    }
    return true;
  }

  private async counts(
    tx: Prisma.TransactionClient,
    phone: string,
    ipBucket: string,
    now: Date,
  ): Promise<Counts> {
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const [row] = await tx.$queryRaw<Counts[]>`
      SELECT
        count(*) FILTER (WHERE phone = ${phone} AND created_at > ${hourAgo})::int AS phone_hour,
        count(*) FILTER (WHERE phone = ${phone})::int AS phone_day,
        max(created_at) FILTER (WHERE phone = ${phone}) AS phone_last,
        min(created_at) FILTER (WHERE phone = ${phone} AND created_at > ${hourAgo}) AS phone_first_hour,
        min(created_at) FILTER (WHERE phone = ${phone}) AS phone_first_day,
        count(*) FILTER (WHERE ip_bucket = ${ipBucket} AND created_at > ${hourAgo})::int AS ip_hour,
        count(*) FILTER (WHERE ip_bucket = ${ipBucket})::int AS ip_day,
        min(created_at) FILTER (WHERE ip_bucket = ${ipBucket} AND created_at > ${hourAgo}) AS ip_first_hour,
        min(created_at) FILTER (WHERE ip_bucket = ${ipBucket}) AS ip_first_day,
        count(*) FILTER (WHERE created_at > ${hourAgo})::int AS all_hour,
        count(*)::int AS all_day
      FROM app.password_reset_requests
      WHERE created_at > ${dayAgo}`;
    return row!;
  }

  /** Seconds until the tightest limit that fired lets go, or null when none did. */
  private retryAfter(counts: Counts, now: Date): number | null {
    const t = now.getTime();
    const waits: number[] = [];
    const until = (from: Date | null, windowMs: number) => (from ? from.getTime() + windowMs - t : windowMs);

    if (counts.phone_last && t - counts.phone_last.getTime() < this.limits.resendCooldownSeconds * 1000) {
      waits.push(counts.phone_last.getTime() + this.limits.resendCooldownSeconds * 1000 - t);
    }
    if (counts.phone_hour >= this.limits.perPhonePerHour) waits.push(until(counts.phone_first_hour, HOUR_MS));
    if (counts.phone_day >= this.limits.perPhonePerDay) waits.push(until(counts.phone_first_day, DAY_MS));
    if (counts.ip_hour >= this.limits.perIpPerHour) waits.push(until(counts.ip_first_hour, HOUR_MS));
    if (counts.ip_day >= this.limits.perIpPerDay) waits.push(until(counts.ip_first_day, DAY_MS));

    if (waits.length === 0) return null;
    return Math.max(1, Math.ceil(Math.max(...waits) / 1000));
  }

  /**
   * The half nobody waits for: find the account, send the code, and only then
   * make the code verifiable.
   *
   * ⚠️ THE ORDER IS THE SECURITY PROPERTY. The hash is written in the same
   * statement that marks the row `sent`, after the sidecar has accepted the
   * message. Until then the row has no hash and `confirm()` cannot match it;
   * a send that throws, times out, is refused by WhatsApp or dies with the
   * process leaves a row with nothing in it to guess. The migration's
   * `hash_only_once_sent` CHECK holds the same rule in the schema.
   *
   * Public so a spec can drive it directly; production reaches it only from
   * `request()`.
   */
  async deliver(id: string): Promise<void> {
    const row = await this.prisma.passwordResetRequest.findUnique({
      where: { id },
      select: { id: true, phone: true, status: true },
    });
    if (!row || row.status !== 'queued') return;

    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: row.phone },
      select: { id: true, role: true, bannedAt: true },
    });

    /*
     * Students only. A staff account reset from a WhatsApp code is a takeover
     * of whoever can read that chat — the same line `StudentsService.setPassword`
     * draws for the admin screen. A banned account is not messaged either: a
     * new password would only lead to the ban screen, and the message would
     * spend a new chat on it. Both look exactly like a number nobody owns.
     */
    if (!user || user.role !== 'student' || user.bannedAt) {
      await this.prisma.passwordResetRequest.updateMany({
        where: { id, status: 'queued' },
        data: { status: 'no_account' },
      });
      return;
    }

    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_LABEL}))`;
      const now = new Date();
      // The cap that protects the number, enforced HERE and nowhere a caller
      // can see: past it the row is marked `capped` with no code, the browser
      // has long since been told `accepted`, and the page's «لو الكود موصلش»
      // line is the way out. Under the lock, so two deliveries racing for the
      // last slot cannot both take it.
      const [sendsHour, sendsDay] = await Promise.all([
        tx.passwordResetRequest.count({
          where: { id: { not: id }, status: { in: [...SEND_STATUSES] }, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
        }),
        tx.passwordResetRequest.count({
          where: { id: { not: id }, status: { in: [...SEND_STATUSES] }, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
        }),
      ]);
      if (sendsHour >= this.limits.sendsPerHour || sendsDay >= this.limits.sendsPerDay) {
        // `capped`, not `failed`: it never reached the wire, so it must not
        // count as a send and hold the cap shut for longer than the sends did.
        await tx.passwordResetRequest.updateMany({ where: { id, status: 'queued' }, data: { status: 'capped', userId: user.id } });
        return false;
      }
      // One live code per number. An older one that is still in the chat
      // stops working the moment a newer one is on its way.
      await tx.passwordResetRequest.updateMany({
        where: { phone: row.phone, status: 'sent' },
        data: { status: 'superseded' },
      });
      const moved = await tx.passwordResetRequest.updateMany({
        where: { id, status: 'queued' },
        data: { status: 'sending', userId: user.id },
      });
      return moved.count === 1;
    });
    if (!claimed) return;

    const code = generateCode();
    try {
      // `source: 'otp'` — on the number-wide ledger and its daily ceiling like
      // every other message, and NOT `inbox`/`bot`/`outreach`: nothing that
      // follows up on a chat reads this as a conversation the platform opened.
      // `send()` also refuses before the wire when the number's daily ceiling
      // is spent, or (423) when WhatsApp is not allowing new chats.
      await this.device.send({ phone: row.phone, text: renderMessage(code), source: 'otp' });
    } catch (error) {
      // Never the code, and never the number in full — this line is in the
      // container log every operator can read.
      this.logger.warn(
        { err: error instanceof Error ? error.name : 'unknown', requestId: id },
        'password reset code not delivered — the request holds no code',
      );
      await this.prisma.passwordResetRequest.updateMany({
        where: { id, status: 'sending' },
        data: { status: 'failed' },
      });
      return;
    }

    const sentAt = new Date();
    await this.prisma.passwordResetRequest.updateMany({
      where: { id, status: 'sending' },
      data: {
        status: 'sent',
        codeHash: hashCode(this.secret, id, code),
        sentAt,
        expiresAt: new Date(sentAt.getTime() + this.limits.codeTtlSeconds * 1000),
      },
    });
  }

  /**
   * The code and the new password, together.
   *
   * ONE answer for everything that is not a right code on a live row: a wrong
   * guess, an expired code, a used one, a burned one, a superseded one, a
   * number that was never sent anything. And ONE statement before that answer
   * is known — the attempt is counted and the row read in the same `UPDATE`,
   * whether or not a row matches — so a number with a live code does not take
   * a measurably different path from a number without one.
   */
  async confirm(input: { phone: string; code: string; newPassword: string }, now = new Date()): Promise<ConfirmOutcome> {
    const max = this.limits.maxAttempts;
    const rows = await this.prisma.$queryRaw<{ id: string; user_id: string | null; code_hash: string | null }[]>`
      UPDATE app.password_reset_requests
      SET attempts = attempts + 1,
          status = CASE WHEN attempts + 1 >= ${max} THEN 'spent' ELSE status END
      WHERE id = (
        SELECT id FROM app.password_reset_requests
        WHERE phone = ${input.phone} AND status = 'sent' AND expires_at > ${now} AND attempts < ${max}
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      )
        AND status = 'sent' AND attempts < ${max}
      RETURNING id::text AS id, user_id, code_hash`;

    const row = rows[0];
    if (!row || !row.user_id || !codeMatches(this.secret, row.id, input.code, row.code_hash)) {
      return { status: 'invalid' };
    }

    // Single use, under concurrency: of two right answers racing, exactly one
    // flips the row. `spent` is allowed here only because THIS request's
    // increment is what spent it — the fifth guess is still a guess.
    const used = await this.prisma.passwordResetRequest.updateMany({
      where: { id: row.id, usedAt: null, status: { in: ['sent', 'spent'] } },
      data: { status: 'used', usedAt: now },
    });
    if (used.count !== 1) return { status: 'invalid' };

    const user = await this.prisma.user.findUnique({
      where: { id: row.user_id },
      select: { id: true, email: true, phoneNumber: true, role: true, bannedAt: true },
    });
    // The account could have changed hands in ten minutes — deleted, promoted,
    // banned, or given a different number. Any of those voids the code.
    if (!user || user.role !== 'student' || user.bannedAt || user.phoneNumber !== input.phone) {
      return { status: 'invalid' };
    }

    const accounts = await this.prisma.account.findMany({
      where: { userId: user.id },
      select: { providerId: true },
    });
    const hasPassword = accounts.some((account) => account.providerId === 'credential');
    const hasGoogle = accounts.some((account) => account.providerId === 'google');

    // Google-only: the code proved the phone, and there is no password to
    // change. Said only now, after a right code — never before it.
    if (!hasPassword && hasGoogle) return { status: 'google' };

    await this.writePassword(user, input.newPassword);
    return { status: 'reset' };
  }

  /**
   * The same write `StudentsService.writePassword` does for the admin screen:
   * the hasher Better Auth verifies with, the login locks cleared, and every
   * session gone — a reset is very often BECAUSE somebody else is signed in.
   */
  private async writePassword(
    user: { id: string; email: string | null; phoneNumber: string | null },
    newPassword: string,
  ): Promise<void> {
    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
    await this.prisma.account.upsert({
      where: { providerId_accountId: { providerId: 'credential', accountId: user.id } },
      update: { password: passwordHash },
      create: {
        id: randomUUID(),
        providerId: 'credential',
        accountId: user.id,
        userId: user.id,
        password: passwordHash,
      },
    });

    // All three buckets — see `StudentsService.writePassword` for why leaving
    // any one standing reads as "the new password did not save".
    if (user.phoneNumber) loginThrottle.clear(throttleKeyFor(phoneIdentifier(user.phoneNumber)));
    if (user.email) loginThrottle.clear(throttleKeyFor(emailIdentifier(user.email)));
    loginThrottle.clear(accountThrottleKey(user.id));

    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
      this.prisma.sessionDevice.deleteMany({ where: { userId: user.id } }),
    ]);

    await this.audit.record({
      action: 'user:password-reset',
      resourceType: 'user',
      resourceId: user.id,
      outcome: 'success',
      actorUserId: user.id,
      metadata: { via: 'whatsapp_code' },
    });
  }
}
