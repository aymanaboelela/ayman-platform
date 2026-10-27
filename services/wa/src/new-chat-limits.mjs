/**
 * What WhatsApp currently allows this account to do about NEW chats.
 *
 * ## Why this matters more than anything else on a new number
 *
 * A freshly linked number has no chat history, so every message it sends —
 * every campaign message, every shipping notice — is a new-chat initiation.
 * WhatsApp meters exactly that, separately from ordinary messaging, and has
 * two ways of saying no:
 *
 *   · **a reach-out timelock** — "this account may not start new chats until
 *     T". While it is active every new-chat message is refused with nack
 *     `463`, while replies into existing chats keep working. That is the
 *     precise shape of the 2026-09 failure: «٧٤ من ٧٤ · اتبعت» and one grey
 *     tick on every one of them.
 *   · **a new-chat message cap** — a quota per cycle, with warnings before
 *     it is reached (`FIRST_WARNING`, `SECOND_WARNING`, then `CAPPED`).
 *
 * Baileys 7 can ask the server for both (`fetchAccountReachoutTimelock`,
 * `fetchNewChatMessageCap`) and is pushed changes to both
 * (`connection.update.reachoutTimeLock`, `message-capping.update`). 6.x had
 * neither, so the only way to discover a restriction was to keep sending into
 * it — and Baileys' own source is explicit that every refused attempt counts
 * as another reach-out and makes the restriction WORSE.
 *
 * This store is what lets `send()` stop BEFORE the wire while WhatsApp has
 * said no, and what lets the device page show the reason and the end time in
 * Arabic instead of an operator discovering it one campaign at a time.
 *
 * Pure apart from the injected clock.
 */
export class NewChatLimits {
  #now;
  /** @type {{ isActive: boolean, until: Date | null, type: string | null } | null} */
  #timelock = null;
  /** @type {{ total: number | null, used: number | null, status: string | null, cycleEndsAt: Date | null } | null} */
  #cap = null;
  #checkedAt = null;

  constructor(now = () => new Date()) {
    this.#now = now;
  }

  /** `connection.update.reachoutTimeLock` or `fetchAccountReachoutTimelock()`. */
  observeTimelock(value) {
    if (!value || typeof value !== 'object') return;
    const until = value.timeEnforcementEnds ? new Date(value.timeEnforcementEnds) : null;
    this.#timelock = {
      isActive: Boolean(value.isActive),
      until: until && !Number.isNaN(until.getTime()) ? until : null,
      type: typeof value.enforcementType === 'string' ? value.enforcementType : null,
    };
    this.#checkedAt = this.#now();
  }

  /** `message-capping.update` or `fetchNewChatMessageCap()`. */
  observeCap(value) {
    if (!value || typeof value !== 'object') return;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const end = Number(value.cycle_end_timestamp);
    this.#cap = {
      total: num(value.total_quota),
      used: num(value.used_quota),
      status: typeof value.capping_status === 'string' ? value.capping_status : null,
      cycleEndsAt: Number.isFinite(end) && end > 0 ? new Date(end * 1000) : null,
    };
    this.#checkedAt = this.#now();
  }

  /** Forget everything — a different number is about to be linked. */
  reset() {
    this.#timelock = null;
    this.#cap = null;
    this.#checkedAt = null;
  }

  /**
   * Why a NEW chat must not be started right now, or `null` if it may.
   *
   * Deliberately decided only by what WhatsApp itself said:
   *
   *   · a timelock counts while its end is in the future (or unknown — an
   *     active lock with no end is still a lock);
   *   · the cap blocks only on `CAPPED`. `used >= total` is NOT checked on its
   *     own: the quota fields are absent or zero on accounts the cap does not
   *     apply to, and `0 >= 0` would have blocked every send on exactly those.
   *
   * @returns {{ reason: 'timelock' | 'capped', until: Date | null } | null}
   */
  blocksNewChats() {
    const now = this.#now();
    const lock = this.#timelock;
    if (lock?.isActive && (lock.until === null || lock.until > now)) {
      return { reason: 'timelock', until: lock.until };
    }
    if (this.#cap?.status === 'CAPPED') {
      const until = this.#cap.cycleEndsAt && this.#cap.cycleEndsAt > now ? this.#cap.cycleEndsAt : null;
      return { reason: 'capped', until };
    }
    return null;
  }

  /** For `/status` — what the device page shows. Dates as ISO strings. */
  snapshot() {
    const blocked = this.blocksNewChats();
    return {
      restricted: blocked !== null,
      reason: blocked?.reason ?? null,
      until: blocked?.until?.toISOString() ?? null,
      quotaTotal: this.#cap?.total ?? null,
      quotaUsed: this.#cap?.used ?? null,
      capStatus: this.#cap?.status ?? null,
      checkedAt: this.#checkedAt?.toISOString() ?? null,
    };
  }
}
