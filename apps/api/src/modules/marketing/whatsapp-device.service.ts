import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import {
  WHATSAPP_SEND_SOURCES,
  WhatsappLimitsSchema,
  type WhatsappDevice,
  type WhatsappHealth,
  type WhatsappSendSource,
} from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cairoDayStart, ceilingResumesAt, deviceCeiling } from '@ayman/contracts/marketing/device-ceiling';
import { DEFAULT_PACING } from '@ayman/contracts/marketing/pacing';
import { waErrorFor } from '@ayman/contracts/marketing/wa-errors';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The API's half of the conversation with `services/wa` — the Baileys sidecar
 * that actually holds the WhatsApp socket.
 *
 * ## Why a sidecar at all, rather than the library in this process
 *
 * Three reasons, in order of how much they cost when ignored:
 *
 *   · **the session must outlive a deploy.** A linked device is a pairing the
 *     instructor did with his own phone; if it were torn down every time the
 *     API image was rebuilt he would be re-scanning a QR code weekly. The
 *     sidecar's auth state is a named volume and it reconnects on its own.
 *   · **Baileys is not a library you want in an API's dependency tree.** It
 *     reconnects, retries, and throws from timers — an unhandled rejection
 *     from a socket must not be able to take down the process that serves the
 *     player.
 *   · **it is unofficial.** Isolating it means the day it stops working, or
 *     the day it is replaced by the official Cloud API, exactly one container
 *     and this one file change.
 *
 * ## Every method fails soft
 *
 * `status()` NEVER throws: the admin screen's whole job when the sidecar is
 * down is to say so, and a 500 there would render the same «حصل خطأ» page as
 * a real fault. `send()` does throw, because a campaign that cannot reach the
 * device must stop rather than march through four thousand recipients marking
 * each one failed.
 */

/** The device is asked how it is doing on every page load; keep it short. */
const STATUS_TIMEOUT_MS = 4000;
/**
 * Pairing is NOT a status read, and sharing that 4s budget with one was a
 * bug: the sidecar deliberately holds `POST /link` open until WhatsApp has
 * actually issued a QR (up to `WA_LINK_QR_WAIT_MS`, 10s by default) so the
 * response carries the code instead of the pre-click state. Aborting at 4s
 * turned the common case — a handshake that takes six — into a failed action
 * and a red toast, on the one button whose whole job is to produce a code.
 *
 * Comfortably above the sidecar's own ceiling, so the timeout that decides
 * this is the one that knows what it is waiting for.
 */
const LINK_TIMEOUT_MS = 20_000;
/** A send uploads an image and waits on WhatsApp's own ack. */
const SEND_TIMEOUT_MS = 45_000;

export interface SendInput {
  /** E.164, with the `+`. The sidecar strips it. */
  phone: string;
  text: string;
  /** A publicly reachable URL the sidecar downloads. */
  imageUrl?: string | null;
  /**
   * Who is sending, for the `whatsapp_sends` ledger. `test` is counted toward
   * the number's daily ceiling but never refused by it — see
   * `device-ceiling.ts`. Defaults to `other` so a new caller that forgets it
   * is still counted, not exempted.
   */
  source?: WhatsappSendSource;
}

export interface SendResult {
  /** WhatsApp's message id, for the log — and for matching the receipt. */
  messageId: string | null;
  /** What the sidecar addressed: `<digits>@s.whatsapp.net`. */
  jid?: string | null;
  /** What WhatsApp says the canonical address is. Normally the same. */
  serverJid?: string | null;
  /**
   * WhatsApp's Linked Identity for the recipient, non-null once their account
   * has migrated to LID addressing. Reported, never addressed — see the
   * sidecar's `send()`. This is the field that answers whether LID is why a
   * message was accepted and never delivered.
   */
  lid?: string | null;
}

/**
 * What WhatsApp has said about one message so far.
 *
 * `null` is not failure. It is "no receipt yet", which for a phone that is
 * off is the correct answer for hours — and treating it as failure is the
 * mirror image of the bug that made `sent` mean delivered.
 */
export interface ReceiptStatus {
  messageId: string;
  /** `proto.WebMessageInfo.Status`: 3 delivered, 4 read, 0 refused. */
  status: number | null;
  /** WhatsApp's refusal code, when `status` is 0. */
  code: string | null;
  /** Its Arabic explanation. */
  explanation: string | null;
}

const DISABLED: WhatsappDevice = {
  state: 'disabled',
  phone: null,
  qr: null,
  pairingCode: null,
  detail: null,
  connectedAt: null,
  limits: null,
};

/** `proto.WebMessageInfo.Status`. Mirrors `services/wa/src/receipt-store.mjs`. */
const REFUSED = 0;
const DELIVERY_ACK = 3;
const READ = 4;

/** Below this many sends in the window a percentage is noise, not a rate. */
const MIN_SENDS_FOR_RATE = 5;
const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_REFUSALS = 8;

/** Thrown by `send` when WhatsApp says the number has no account. */
export class NotOnWhatsAppError extends Error {
  constructor(phone: string) {
    super(`${phone} is not on WhatsApp`);
    this.name = 'NotOnWhatsAppError';
  }
}

/**
 * Thrown by `send` BEFORE anything reaches the sidecar: the number has spent
 * today's ceiling (every sender together — `device-ceiling.ts`).
 *
 * Not a device fault and not a recipient fault. A campaign reschedules to
 * `resumesAt` without spending an attempt; a shipping notice reports it.
 */
export class DeviceCeilingError extends Error {
  readonly userMessage: string;
  constructor(
    readonly limit: number,
    readonly resumesAt: Date,
  ) {
    super(`whatsapp daily ceiling reached (${limit})`);
    this.name = 'DeviceCeilingError';
    this.userMessage = formatCopy(copy.marketing.waCeilingReached, { limit });
  }
}

/**
 * Thrown by `send` when the sidecar refused to put a NEW chat on the wire
 * because WhatsApp has said it is not allowing new chats right now (a
 * reach-out timelock or the new-chat cap). Nothing was sent — and sending
 * into it would have deepened the restriction (nack 463).
 */
export class WhatsappRestrictedError extends Error {
  readonly userMessage = copy.marketing.waRestricted;
  constructor(
    readonly reason: 'timelock' | 'capped' | null,
    readonly until: Date | null,
  ) {
    super(`whatsapp is not allowing new chats (${reason ?? 'unknown'})`);
    this.name = 'WhatsappRestrictedError';
  }
}

/** A non-2xx from the sidecar, with its body kept so callers can read it. */
class SidecarError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'SidecarError';
  }
}

/** `+201001234567` → `+2010•••••567` — enough to recognise, not to dial. */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 5)}${'•'.repeat(Math.max(0, phone.length - 8))}${phone.slice(-3)}`;
}

@Injectable()
export class WhatsappDeviceService {
  private readonly logger = new Logger(WhatsappDeviceService.name);
  private readonly base: string | null;
  private readonly token: string | null;

  /*
   * `@Optional()` so the unit specs that build this service by hand keep
   * working; without a Prisma the ledger, the ceiling and the health read are
   * simply skipped. Nest always injects it.
   */
  constructor(@Optional() private readonly prisma?: PrismaService) {
    const env = loadEnv(process.env);
    this.base = env.WA_SERVICE_URL?.replace(/\/+$/, '') ?? null;
    this.token = env.WA_SERVICE_TOKEN ?? null;
  }

  /** Whether a sender is configured at all. `false` in local development. */
  get enabled(): boolean {
    return this.base !== null && this.token !== null;
  }

  private async call(path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    if (!this.base || !this.token) throw new ServiceUnavailableException('WhatsApp sender is not configured');

    const response = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-wa-token': this.token,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
      const detail = record && 'error' in record ? String(record.error) : '';
      throw new SidecarError(`wa ${path} ${response.status}${detail ? `: ${detail}` : ''}`, response.status, record);
    }
    return body;
  }

  /**
   * The device's own account of itself, or the closest thing to it this
   * process can obtain.
   *
   * `disabled` and `unreachable` are deliberately different states. The first
   * means nobody has configured a sender and the screen should explain how;
   * the second means one is configured and is not answering, which is an
   * operational fault and reads completely differently to whoever is looking
   * at it.
   */
  async status(): Promise<WhatsappDevice> {
    if (!this.enabled) return DISABLED;
    try {
      const body = (await this.call('/status', { method: 'GET' }, STATUS_TIMEOUT_MS)) as Partial<WhatsappDevice>;
      return {
        state: body.state ?? 'disconnected',
        phone: body.phone ?? null,
        qr: body.qr ?? null,
        pairingCode: typeof body.pairingCode === 'string' ? body.pairingCode : null,
        detail: body.detail ?? null,
        connectedAt: typeof body.connectedAt === 'string' ? body.connectedAt : null,
        // Parsed rather than trusted: an older sidecar has no `limits`, and a
        // malformed one must not take the device page down with it.
        limits: WhatsappLimitsSchema.safeParse(body.limits).data ?? null,
      };
    } catch (error) {
      this.logger.warn({ err: error }, 'whatsapp sidecar unreachable');
      return {
        ...DISABLED,
        state: 'unreachable',
        detail: error instanceof Error ? error.message.slice(0, 200) : null,
      };
    }
  }

  /**
   * Begin pairing. The sidecar answers with a QR immediately and keeps
   * refreshing it; the screen polls `status()` until the state flips to
   * `connected`.
   */
  async link(phone?: string | null): Promise<WhatsappDevice> {
    // `phone` asks for an 8-character pairing code instead of a QR — for
    // linking from the same phone that shows the admin page.
    await this.call(
      '/link',
      { method: 'POST', ...(phone ? { body: JSON.stringify({ phone }) } : {}) },
      LINK_TIMEOUT_MS,
    );
    return this.status();
  }

  /** Drop the pairing and wipe the stored credentials. */
  async unlink(): Promise<void> {
    await this.call('/unlink', { method: 'POST' }, STATUS_TIMEOUT_MS);
  }

  async send(input: SendInput): Promise<SendResult> {
    const source = input.source ?? 'other';

    // The number's ceiling, before anything reaches the wire. A test send is
    // never refused by it — see `SendInput.source`.
    if (source !== 'test') await this.assertWithinCeiling();

    let body: {
      messageId?: string | null;
      onWhatsApp?: boolean;
      jid?: string | null;
      serverJid?: string | null;
      lid?: string | null;
      sender?: string | null;
    };
    try {
      body = (await this.call(
        '/send',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: input.phone,
            text: input.text,
            imageUrl: input.imageUrl ?? undefined,
          }),
        },
        SEND_TIMEOUT_MS,
      )) as typeof body;
    } catch (error) {
      // 423 — the sidecar refused to start a new chat into a restriction
      // WhatsApp announced. Typed, so callers can pause rather than fail.
      if (error instanceof SidecarError && error.status === 423) {
        const reason = error.body?.code === 'timelock' || error.body?.code === 'capped' ? error.body.code : null;
        const until = typeof error.body?.until === 'string' ? new Date(error.body.until) : null;
        throw new WhatsappRestrictedError(reason, until && !Number.isNaN(until.getTime()) ? until : null);
      }
      throw error;
    }

    // A number that is not registered is not a failure of the campaign — it
    // is a fact about the number, and the caller marks the row `skipped`
    // rather than retrying it forever.
    if (body.onWhatsApp === false) throw new NotOnWhatsAppError(input.phone);

    const messageId = body.messageId ?? null;
    if (messageId) await this.record(messageId, source, input.phone, body.sender ?? null);

    return {
      messageId,
      jid: body.jid ?? null,
      serverJid: body.serverJid ?? null,
      lid: body.lid ?? null,
    };
  }

  /**
   * The ledger row for one message on the wire. Best effort: the message HAS
   * been sent, and a failed insert must not turn that into a send failure the
   * caller would retry — that would message the same person twice.
   */
  private async record(messageId: string, source: WhatsappSendSource, toPhone: string, fromPhone: string | null) {
    if (!this.prisma) return;
    try {
      await this.prisma.whatsappSend.create({
        data: { messageId, source, toPhone: toPhone.slice(0, 20), fromPhone: fromPhone?.slice(0, 20) ?? null },
      });
    } catch (error) {
      this.logger.warn({ err: error, messageId }, 'whatsapp send ledger insert failed');
    }
  }

  /**
   * Throws `DeviceCeilingError` when the number has spent today's ceiling.
   *
   * Public so a caller with a SECOND leg can ask before doing it: a `both`
   * campaign posts into the student's platform thread first, and finding out
   * about the ceiling only at the WhatsApp leg would post that platform
   * message again every day the campaign is held back.
   */
  async assertWithinCeiling(now = new Date()): Promise<void> {
    const ceiling = await this.ceiling(null, now);
    if (ceiling && ceiling.usedToday >= ceiling.limit) {
      throw new DeviceCeilingError(ceiling.limit, ceilingResumesAt(now, DEFAULT_PACING));
    }
  }

  /**
   * A receipt for any message the number sent — the ledger half of
   * `WhatsappReceiptController`. Highest-status-wins: each timestamp is only
   * ever set once, and a refusal never overwrites a delivery.
   */
  async recordReceipt(messageId: string, status: number, code: string | null, at = new Date()): Promise<void> {
    if (!this.prisma) return;
    if (status >= DELIVERY_ACK) {
      await this.prisma.whatsappSend.updateMany({ where: { messageId, deliveredAt: null }, data: { deliveredAt: at } });
      if (status >= READ) {
        await this.prisma.whatsappSend.updateMany({ where: { messageId, readAt: null }, data: { readAt: at } });
      }
      return;
    }
    if (status === REFUSED) {
      await this.prisma.whatsappSend.updateMany({
        where: { messageId, deliveredAt: null },
        data: { errorCode: code?.slice(0, 16) ?? null, refusedAt: at },
      });
    }
  }

  /**
   * Today's count against the number's ceiling.
   *
   * `phone` is the currently linked number when the caller knows it (the
   * device page does); otherwise the sender of the most recent ledger row.
   * The difference is one message: the first send of a newly linked number is
   * judged by the previous number's ramp, and every send after it by its own.
   */
  private async ceiling(phone: string | null, now: Date): Promise<WhatsappHealth['ceiling'] | null> {
    if (!this.prisma) return null;
    let sender = phone;
    if (!sender) {
      const latest = await this.prisma.whatsappSend.findFirst({
        where: { fromPhone: { not: null } },
        orderBy: { sentAt: 'desc' },
        select: { fromPhone: true },
      });
      sender = latest?.fromPhone ?? null;
    }
    const [first, usedToday] = await Promise.all([
      sender
        ? this.prisma.whatsappSend.findFirst({
            where: { fromPhone: sender },
            orderBy: { sentAt: 'asc' },
            select: { sentAt: true },
          })
        : Promise.resolve(null),
      this.prisma.whatsappSend.count({ where: { sentAt: { gte: cairoDayStart(now) } } }),
    ]);
    const ramp = deviceCeiling(first?.sentAt ?? null, now);
    return { usedToday, limit: ramp.limit, day: ramp.day, warmingUp: ramp.warmingUp };
  }

  /**
   * «الإرسال في آخر ٢٤ ساعة» — what the device page shows under the pairing.
   * Every number here is from the ledger, i.e. covers every sender.
   */
  async health(now = new Date()): Promise<WhatsappHealth> {
    const empty: WhatsappHealth = {
      window: { sent: 0, delivered: 0, read: 0, refused: 0, waiting: 0, deliveryRate: null },
      lastDeliveredAt: null,
      lastSentAt: null,
      refusals: [],
      recent: [],
      ceiling: { usedToday: 0, limit: deviceCeiling(null, now).limit, day: 0, warmingUp: true },
    };
    if (!this.prisma) return empty;

    const since = new Date(now.getTime() - HEALTH_WINDOW_MS);
    const inWindow = { sentAt: { gte: since } };
    const device = await this.status();

    const [sent, delivered, read, refused, lastDelivered, lastSent, grouped, recent, ceiling] = await Promise.all([
      this.prisma.whatsappSend.count({ where: inWindow }),
      this.prisma.whatsappSend.count({ where: { ...inWindow, deliveredAt: { not: null } } }),
      this.prisma.whatsappSend.count({ where: { ...inWindow, readAt: { not: null } } }),
      this.prisma.whatsappSend.count({ where: { ...inWindow, refusedAt: { not: null }, deliveredAt: null } }),
      this.prisma.whatsappSend.findFirst({
        where: { deliveredAt: { not: null } },
        orderBy: { deliveredAt: 'desc' },
        select: { deliveredAt: true },
      }),
      this.prisma.whatsappSend.findFirst({ orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
      this.prisma.whatsappSend.groupBy({
        by: ['errorCode'],
        where: { ...inWindow, refusedAt: { not: null }, deliveredAt: null },
        _count: { _all: true },
      }),
      this.prisma.whatsappSend.findMany({
        where: { refusedAt: { not: null }, deliveredAt: null },
        orderBy: [{ refusedAt: 'desc' }, { id: 'desc' }],
        take: RECENT_REFUSALS,
        select: { refusedAt: true, toPhone: true, source: true, errorCode: true },
      }),
      this.ceiling(device.phone, now),
    ]);

    return {
      window: {
        sent,
        delivered,
        read,
        refused,
        waiting: Math.max(0, sent - delivered - refused),
        deliveryRate: sent >= MIN_SENDS_FOR_RATE ? delivered / sent : null,
      },
      lastDeliveredAt: lastDelivered?.deliveredAt?.toISOString() ?? null,
      lastSentAt: lastSent?.sentAt.toISOString() ?? null,
      refusals: grouped
        .map((row) => ({
          code: row.errorCode ?? '—',
          count: row._count._all,
          explanation: waErrorFor(row.errorCode) ?? copy.marketing.waErrorNoCode,
        }))
        .sort((a, b) => b.count - a.count),
      recent: recent.map((row) => ({
        at: (row.refusedAt ?? now).toISOString(),
        phone: maskPhone(row.toPhone),
        source: (WHATSAPP_SEND_SOURCES as readonly string[]).includes(row.source)
          ? (row.source as WhatsappSendSource)
          : 'other',
        code: row.errorCode,
        explanation: waErrorFor(row.errorCode),
      })),
      ceiling: ceiling ?? empty.ceiling,
    };
  }

  /**
   * Whether one message has been acknowledged by a device yet.
   *
   * Reads the sidecar's own in-memory view rather than the database, because
   * this exists for a message that has no recipient row — a test send. Its
   * memory is bounded and does not survive a restart; a `null` from a sidecar
   * that has restarted is indistinguishable from a message nobody received,
   * which is why this is a diagnostic and not a record.
   */
  async receipt(messageId: string): Promise<ReceiptStatus> {
    const body = (await this.call(
      `/receipt?id=${encodeURIComponent(messageId)}`,
      { method: 'GET' },
      STATUS_TIMEOUT_MS,
    )) as { messageId?: string; status?: number | null; code?: string | null };
    const code = typeof body.code === 'string' ? body.code : null;
    return { messageId, status: body.status ?? null, code, explanation: waErrorFor(code) };
  }
}
