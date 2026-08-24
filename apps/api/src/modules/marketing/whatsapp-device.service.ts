import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { WhatsappDevice } from '@ayman/contracts/marketing/campaign';
import { loadEnv } from '../../config/env';

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
/** A send uploads an image and waits on WhatsApp's own ack. */
const SEND_TIMEOUT_MS = 45_000;

export interface SendInput {
  /** E.164, with the `+`. The sidecar strips it. */
  phone: string;
  text: string;
  /** A publicly reachable URL the sidecar downloads. */
  imageUrl?: string | null;
}

export interface SendResult {
  /** WhatsApp's message id, for the log. */
  messageId: string | null;
}

const DISABLED: WhatsappDevice = {
  state: 'disabled',
  phone: null,
  qr: null,
  detail: null,
};

/** Thrown by `send` when WhatsApp says the number has no account. */
export class NotOnWhatsAppError extends Error {
  constructor(phone: string) {
    super(`${phone} is not on WhatsApp`);
    this.name = 'NotOnWhatsAppError';
  }
}

@Injectable()
export class WhatsappDeviceService {
  private readonly logger = new Logger(WhatsappDeviceService.name);
  private readonly base: string | null;
  private readonly token: string | null;

  constructor() {
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
      const detail =
        body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : '';
      throw new Error(`wa ${path} ${response.status}${detail ? `: ${detail}` : ''}`);
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
        detail: body.detail ?? null,
      };
    } catch (error) {
      this.logger.warn({ err: error }, 'whatsapp sidecar unreachable');
      return {
        state: 'unreachable',
        phone: null,
        qr: null,
        detail: error instanceof Error ? error.message.slice(0, 200) : null,
      };
    }
  }

  /**
   * Begin pairing. The sidecar answers with a QR immediately and keeps
   * refreshing it; the screen polls `status()` until the state flips to
   * `connected`.
   */
  async link(): Promise<WhatsappDevice> {
    await this.call('/link', { method: 'POST' }, STATUS_TIMEOUT_MS);
    return this.status();
  }

  /** Drop the pairing and wipe the stored credentials. */
  async unlink(): Promise<void> {
    await this.call('/unlink', { method: 'POST' }, STATUS_TIMEOUT_MS);
  }

  async send(input: SendInput): Promise<SendResult> {
    const body = (await this.call(
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
    )) as { messageId?: string | null; onWhatsApp?: boolean };

    // A number that is not registered is not a failure of the campaign — it
    // is a fact about the number, and the caller marks the row `skipped`
    // rather than retrying it forever.
    if (body.onWhatsApp === false) throw new NotOnWhatsAppError(input.phone);
    return { messageId: body.messageId ?? null };
  }
}
