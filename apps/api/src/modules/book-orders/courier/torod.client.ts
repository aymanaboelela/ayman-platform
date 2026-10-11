import { Injectable, Logger } from '@nestjs/common';

import { loadEnv } from '../../../config/env';
import { readAddOrdersResponse, TOROD_BASE_URL, TOROD_INTEGRATION_ID, type TorodOrder } from './torod';

/**
 * Their API is a single box in Cairo answering a phone app and every merchant's
 * integration at once; 15 seconds is generous for one order and short enough
 * that a hung call does not hold the admin's «ابعت» button for a minute.
 */
const TIMEOUT_MS = 15_000;

/** Areas change when they open a district, which is rare — half a day is
 *  plenty, and a restart clears it anyway. */
const AREAS_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The HTTP half of the courier — `torod.ts` decides what to send, this sends it.
 */
@Injectable()
export class TorodClient {
  private readonly logger = new Logger(TorodClient.name);
  private readonly areas = new Map<number, { at: number; list: string[] }>();

  /** The account, or null when this stack has none — see `TOROD_LOGIN`. */
  credentials(): { login: string; password: string } | null {
    const env = loadEnv(process.env);
    if (!env.TOROD_LOGIN || !env.TOROD_PASSWORD) return null;
    return { login: env.TOROD_LOGIN, password: env.TOROD_PASSWORD };
  }

  /**
   * One parcel, one call.
   *
   * Not batched, although `addorders` takes an array: their refusal names no
   * order, so one bad address in a batch of thirty would refuse all thirty with
   * a sentence that says which of them is wrong nowhere. One at a time, each
   * row carries its own answer.
   */
  async addOrder(order: TorodOrder): Promise<{ ok: true } | { ok: false; error: string }> {
    const account = this.credentials();
    if (!account) return { ok: false, error: 'حساب شركة الشحن مش متظبط على المنصة' };

    try {
      const response = await fetch(`${TOROD_BASE_URL}/api/Client/addorders`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_login_nm: account.login,
          client_login_pass: account.password,
          integration_id: TOROD_INTEGRATION_ID,
          orders: [order],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text.slice(0, 200) };
      }
      const result = readAddOrdersResponse(response.status, body);
      // The body of an ACCEPTED order is undocumented — logged so the first
      // real one tells us what `result` carries (their shipment id, maybe).
      if (result.ok) this.logger.log(`addorders ${order.sender_Code}: ${text.slice(0, 500)}`);
      else this.logger.warn(`addorders ${order.sender_Code} refused (${response.status}): ${text.slice(0, 500)}`);
      return result;
    } catch (error) {
      this.logger.warn(`addorders ${order.sender_Code} failed: ${String(error)}`);
      return { ok: false, error: 'شركة الشحن مش بترد دلوقتي — جرّب تاني بعد شوية' };
    }
  }

  /**
   * Their area list for each city, cached. A city whose list cannot be fetched
   * comes back empty rather than failing the push: the area is a guess anyway,
   * and `placeFor` falls back to the student's own words.
   */
  async areasFor(cityIds: readonly number[]): Promise<Map<number, string[]>> {
    const out = new Map<number, string[]>();
    await Promise.all(
      [...new Set(cityIds)].map(async (cityId) => {
        const cached = this.areas.get(cityId);
        if (cached && Date.now() - cached.at < AREAS_TTL_MS) {
          out.set(cityId, cached.list);
          return;
        }
        try {
          const response = await fetch(`${TOROD_BASE_URL}/api/Client/getareas?cityid=${cityId}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const body = (await response.json()) as { result?: { data?: { area_Ar_Nm?: unknown }[] } };
          const list = (body.result?.data ?? [])
            .map((area) => area.area_Ar_Nm)
            .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
          this.areas.set(cityId, { at: Date.now(), list });
          out.set(cityId, list);
        } catch (error) {
          this.logger.warn(`getareas ${cityId} failed: ${String(error)}`);
          out.set(cityId, cached?.list ?? []);
        }
      }),
    );
    return out;
  }
}
