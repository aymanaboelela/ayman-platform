/**
 * «مين كلّمني قبل كده» — which numbers already had a chat with this number
 * when it was linked, read off the history sync WhatsApp pushes on link.
 *
 * ## What arrives, and how far back (Baileys 7.0.0-rc14, read from its source)
 *
 * Linking a companion device makes the PHONE push it history, as
 * `protocolMessage.historySyncNotification`s that Baileys downloads, decodes
 * and emits as `messaging-history.set` (`Utils/process-message.js`). With
 * `syncFullHistory: false` — which `index.mjs` keeps, deliberately — the
 * registration asks for `requireFullSync: false` with no `recentSyncDaysLimit`
 * (`Utils/validate-connection.js`), so the phone sends:
 *
 *   · INITIAL_BOOTSTRAP — the chat list, each chat with its latest messages,
 *     plus `phoneNumberToLidMappings`. Inline in the first notification.
 *   · RECENT — more recent messages per chat, in chunks, until `progress`
 *     reaches 100 (or Baileys gives up waiting after 120 s of silence).
 *   · PUSH_NAME — display names only. NON_BLOCKING_DATA — misc.
 *
 * FULL (years of messages) is never requested, and Baileys' default
 * `shouldSyncHistoryMessage` would drop it anyway. How far RECENT reaches is
 * the PHONE's decision, not Baileys': nothing in the library caps it in days.
 * In practice that is the WhatsApp Web amount — roughly the last few months
 * of messages — while the CHAT LIST in the bootstrap goes back further than
 * the messages in it. Hence the two signals reported per phone:
 *
 *   · `hasChat` — the chat is in the list. This is what decides whether
 *     WhatsApp treats a message as a new-chat initiation, and it is what the
 *     platform's «كلّمني / مكلّمنيش» filters key on.
 *   · `theyWroteToUs` — a message FROM them was in the synced window. `false`
 *     means "not in the window", not "never".
 *
 * ## Once, on link — so nothing here may be lossy
 *
 * The server sends history to a NEW companion only. On a reconnect
 * (`creds.accountSyncCounter > 0`) Baileys does not even wait for it
 * (`Socket/chats.js`). A dropped post is therefore gone until somebody
 * unlinks and links again, which is why posts are retried with backoff and
 * the folded totals are kept in memory until they land.
 *
 * ## What it never does
 *
 * It never sees a message body leave this process: only counts and
 * timestamps are kept, and the report has no field for text. It never
 * relays anything to the inbound route, so the auto-reply bot, «قف» and
 * outreach cannot fire on a two-year-old message. (History messages do not
 * reach `messages.upsert` at all — the only upsert is the protocol message
 * that carries the notification, and it has no text for `inboundText` to
 * relay.)
 */

const PN_SUFFIXES = ['@s.whatsapp.net', '@hosted'];
const LID_SUFFIXES = ['@lid', '@hosted.lid'];

/** `'pn'`, `'lid'`, or `null` for a group, broadcast, status or newsletter. */
export function jidKind(jid) {
  const value = String(jid ?? '');
  if (LID_SUFFIXES.some((suffix) => value.endsWith(suffix))) return 'lid';
  if (PN_SUFFIXES.some((suffix) => value.endsWith(suffix))) return 'pn';
  return null;
}

/** `+<digits>` for a phone-number JID (device suffix dropped), else null. */
export function phoneOfPn(jid) {
  if (jidKind(jid) !== 'pn') return null;
  const digits = String(jid).split('@')[0].split(':')[0].replace(/\D/gu, '');
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/** Seconds since the epoch from a number, a protobuf `Long`, or a string. */
export function toSeconds(value) {
  if (value === null || value === undefined) return null;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function iso(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * Whether a history message is something a PERSON sent — not a stub («the
 * security code changed», «messages are end-to-end encrypted») and not a
 * protocol message (a revoke, a key share). Those carry `fromMe: false` too,
 * and counting them would call a chat where they never typed a word «كتبولي».
 */
export function isPersonMessage(message) {
  if (!message?.message || message.messageStubType) return false;
  const keys = Object.keys(message.message).filter((key) => key !== 'messageContextInfo');
  if (keys.length === 0) return false;
  return !keys.every((key) => key === 'protocolMessage' || key === 'senderKeyDistributionMessage');
}

/**
 * Folds `messaging-history.set` events into one summary per phone number and
 * posts them in batches.
 *
 * @param {object} options
 * @param {(entries: object[]) => Promise<{ ok: boolean, status: number }>} options.send
 * @param {{ info: Function, warn: Function, error: Function }} options.logger
 * @param {() => string | null} [options.selfPhone] our own number, never reported
 */
export class HistoryChats {
  constructor({
    send,
    logger,
    selfPhone = () => null,
    batchSize = 200,
    flushDelayMs = 15_000,
    retryDelaysMs = [30_000, 120_000, 600_000, 1_800_000, 3_600_000],
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    this.send = send;
    this.logger = logger;
    this.selfPhone = selfPhone;
    this.batchSize = batchSize;
    this.flushDelayMs = flushDelayMs;
    this.retryDelaysMs = retryDelaysMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.reset();
  }

  /** Forget everything — `/unlink`, or a different number about to be linked. */
  reset() {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.byPhone = new Map();
    this.dirty = new Set();
    /** `${jid}:${id}` of inbound messages already counted — chunks overlap. */
    this.seen = new Set();
    this.attempt = 0;
    this.flushing = null;
    this.epoch = (this.epoch ?? 0) + 1;
  }

  entry(phone) {
    let entry = this.byPhone.get(phone);
    if (!entry) {
      entry = { phone, hasChat: true, theyWroteToUs: false, inboundCount: 0, lastMessageAt: null, lastInboundAt: null };
      this.byPhone.set(phone, entry);
    }
    return entry;
  }

  /**
   * One `messaging-history.set` event.
   *
   * @param {{ chats?: object[], messages?: object[], contacts?: object[], lidPnMappings?: { lid: string, pn: string }[] }} event
   * @param {(lid: string) => Promise<string | null | undefined>} [pnForLid]
   *   the library's own store (`signalRepository.lidMapping.getPNForLID`),
   *   which Baileys fills from this very sync BEFORE emitting the event
   * @returns {Promise<{ chats: number, unresolved: number }>}
   */
  async observe(event, pnForLid) {
    const epoch = this.epoch;
    const self = this.selfPhone();

    // Every LID→phone pairing this event itself carries. The library's store
    // has them too, but the event is free and the store is a disk read.
    const local = new Map();
    const learn = (lid, pn) => {
      if (jidKind(lid) === 'lid' && phoneOfPn(pn)) local.set(lid, phoneOfPn(pn));
    };
    for (const m of event?.lidPnMappings ?? []) learn(m?.lid, m?.pn);
    for (const chat of event?.chats ?? []) {
      learn(chat?.id, chat?.pnJid);
      learn(chat?.lidJid, chat?.id);
    }
    for (const contact of event?.contacts ?? []) {
      learn(contact?.id, contact?.phoneNumber);
      learn(contact?.lid, contact?.id);
    }
    for (const message of event?.messages ?? []) learn(message?.key?.remoteJid, message?.key?.remoteJidAlt);

    const resolved = new Map();
    const resolve = async (jid) => {
      if (resolved.has(jid)) return resolved.get(jid);
      let phone = null;
      const kind = jidKind(jid);
      if (kind === 'pn') phone = phoneOfPn(jid);
      else if (kind === 'lid') {
        phone = local.get(jid) ?? null;
        if (!phone && pnForLid) {
          try {
            phone = phoneOfPn(await pnForLid(jid));
          } catch {
            // The store failing is "unknown", not a reason to drop the batch.
          }
        }
      }
      if (phone && phone === self) phone = null;
      resolved.set(jid, phone);
      return phone;
    };

    let chats = 0;
    let unresolved = 0;
    const touched = new Set();

    for (const chat of event?.chats ?? []) {
      const kind = jidKind(chat?.id);
      if (!kind) continue;
      const phone = await resolve(chat.id);
      if (!phone) {
        if (kind === 'lid') unresolved += 1;
        continue;
      }
      chats += 1;
      touched.add(phone);
      const entry = this.entry(phone);
      const last = Math.max(
        toSeconds(chat.conversationTimestamp) ?? 0,
        toSeconds(chat.lastMsgTimestamp) ?? 0,
        toSeconds(chat.lastMessageRecvTimestamp) ?? 0,
      );
      if (last && (!entry.lastMessageAt || last * 1000 > Date.parse(entry.lastMessageAt))) entry.lastMessageAt = iso(last);
      // Baileys stamps `lastMessageRecvTimestamp` only from a message that is
      // not ours; an unread count can only be messages from them.
      const received = toSeconds(chat.lastMessageRecvTimestamp);
      if (received || Number(chat.unreadCount) > 0) entry.theyWroteToUs = true;
      if (received && (!entry.lastInboundAt || received * 1000 > Date.parse(entry.lastInboundAt))) {
        entry.lastInboundAt = iso(received);
      }
    }

    for (const message of event?.messages ?? []) {
      const jid = message?.key?.remoteJid;
      if (!jidKind(jid)) continue;
      const phone = await resolve(jid);
      if (!phone) continue;
      touched.add(phone);
      // A message in a chat is the chat — even when its chat row came in an
      // earlier event, or not at all.
      const entry = this.entry(phone);
      const at = toSeconds(message.messageTimestamp);
      if (at && (!entry.lastMessageAt || at * 1000 > Date.parse(entry.lastMessageAt))) entry.lastMessageAt = iso(at);

      if (message.key.fromMe || !isPersonMessage(message)) continue;
      const id = `${jid}:${message.key.id ?? ''}`;
      if (message.key.id && this.seen.has(id)) continue;
      if (message.key.id) this.seen.add(id);
      entry.theyWroteToUs = true;
      entry.inboundCount += 1;
      if (at && (!entry.lastInboundAt || at * 1000 > Date.parse(entry.lastInboundAt))) entry.lastInboundAt = iso(at);
    }

    // A reset (unlink) while the store was being asked: this event belongs
    // to a number that is no longer linked.
    if (epoch !== this.epoch) return { chats: 0, unresolved: 0 };

    for (const phone of touched) this.dirty.add(phone);
    if (touched.size > 0) this.schedule(this.flushDelayMs);
    if (unresolved > 0) {
      this.logger.warn({ unresolved }, 'wa history: chats under a LID with no known phone number — not reported');
    }
    return { chats, unresolved };
  }

  schedule(delay) {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.flush().catch((error) => this.logger.error({ err: error }, 'wa history: flush failed'));
    }, delay);
    this.timer?.unref?.();
  }

  /**
   * Posts every phone that changed since the last successful post, as running
   * totals (the API merges with OR / GREATEST, so a resend is harmless).
   *
   * A 4xx is final — the route is not there (a stack without the feature) or
   * refused the shape, and asking again will not change its mind. Anything
   * else is retried on a widening backoff.
   */
  async flush() {
    if (this.flushing) return this.flushing;
    const epoch = this.epoch;
    this.flushing = (async () => {
      const phones = [...this.dirty];
      this.dirty.clear();
      let sent = 0;
      for (let i = 0; i < phones.length; i += this.batchSize) {
        const slice = phones.slice(i, i + this.batchSize);
        const entries = slice.map((phone) => ({ ...this.byPhone.get(phone) })).filter((entry) => entry.phone);
        let result;
        try {
          result = await this.send(entries);
        } catch (error) {
          result = { ok: false, status: 0, error };
        }
        if (epoch !== this.epoch) return;
        if (result.ok) {
          sent += entries.length;
          continue;
        }
        if (result.status >= 400 && result.status < 500) {
          this.logger.warn({ status: result.status, dropped: phones.length - i }, 'wa history: the API refused the report — not retrying');
          return;
        }
        // Put back what has not landed, and try again later.
        for (const phone of phones.slice(i)) this.dirty.add(phone);
        const delay = this.retryDelaysMs[Math.min(this.attempt, this.retryDelaysMs.length - 1)];
        if (this.attempt >= this.retryDelaysMs.length) {
          this.logger.error({ pending: this.dirty.size }, 'wa history: giving up on the report after every retry');
          this.dirty.clear();
          return;
        }
        this.attempt += 1;
        this.logger.warn({ status: result.status, err: result.error, retryInMs: delay, pending: this.dirty.size }, 'wa history: report failed — will retry');
        this.schedule(delay);
        return;
      }
      this.attempt = 0;
      if (sent > 0) this.logger.info({ sent, known: this.byPhone.size }, 'wa history: chats reported');
    })();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
      // Chunks that arrived while a post was in flight have no timer of their
      // own — the one they scheduled fired into this flush and joined it.
      if (epoch === this.epoch && this.dirty.size > 0 && !this.timer) this.schedule(this.flushDelayMs);
    }
    return undefined;
  }
}

/**
 * The `send` the service uses: one POST per batch with the shared token.
 * Bounded, because a hung API must not hold the next batch forever.
 */
export function httpSender(url, token, { timeoutMs = 30_000, fetchImpl = fetch } = {}) {
  return async (entries) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wa-token': token },
      body: JSON.stringify({ entries }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: response.ok, status: response.status };
  };
}

/**
 * Where the report goes: `WA_HISTORY_URL`, else the inbound route's sibling.
 *
 * Derived rather than required so the compose file — which already points
 * `WA_INBOUND_URL` at `…/api/marketing/wa/inbound` — needs no new variable
 * for this to work on every stack.
 */
export function historyUrl(env) {
  const explicit = String(env.WA_HISTORY_URL ?? '').trim();
  if (explicit) return explicit;
  const inbound = String(env.WA_INBOUND_URL ?? '').trim();
  return inbound.endsWith('/inbound') ? `${inbound.slice(0, -'/inbound'.length)}/history` : '';
}
