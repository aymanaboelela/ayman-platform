/**
 * What WhatsApp said happened to each message AFTER it left.
 *
 * ## The hole this fills
 *
 * `sock.sendMessage()` resolving means one thing: the encrypted stanza was
 * written to the socket and WhatsApp's servers took custody of it. That is the
 * FIRST grey tick. It says nothing whatsoever about whether any device ever
 * received it, and for weeks it was the only signal this service produced —
 * so the API recorded `status: 'sent'` for messages that were accepted by
 * WhatsApp and delivered to nobody, and the campaign screen reported those
 * runs as «٧٤ من ٧٤ · اتبعت»، ٠ فشل. Byte-identical to a perfect run.
 *
 * Baileys was telling us the whole time. `handleReceipt` emits
 * `messages.update` with a `status`, and `handleBadAck` emits `status: ERROR`
 * — into an emitter that had no subscriber, because `index.mjs` listened only
 * for `creds.update`, `connection.update` and `messages.upsert`.
 *
 * ## Why a store rather than a straight relay
 *
 * Receipts are duplicated and out of order. A phone with three linked devices
 * acks three times; a read receipt can be parsed before the delivery receipt
 * that logically preceded it; a reconnect replays what it missed. Relaying
 * each one would POST the API four times per message and — worse — a late
 * DELIVERY_ACK arriving after a READ would walk the row BACKWARDS, turning
 * «قراها» into «وصلت».
 *
 * So: highest-status-wins, and only a new maximum is worth telling anyone
 * about. `observe` is the whole contract — it returns the status to relay, or
 * `null` for "nothing new here".
 *
 * ## Why ERROR is not a maximum
 *
 * Status 0 is WhatsApp refusing the message (`handleBadAck`). It is the one
 * value that is not a rung on the ladder — it is the ladder falling over — so
 * it is always relayed and never allowed to suppress a later real status, and
 * it never overwrites a message that had already reached a device.
 */

/** `proto.WebMessageInfo.Status`, the values that reach us. */
export const STATUS = {
  ERROR: 0,
  PENDING: 1,
  /** WhatsApp's servers have it. ONE TICK. Not delivery. */
  SERVER_ACK: 2,
  /** A device has it. The second tick — the only proof that matters here. */
  DELIVERY_ACK: 3,
  READ: 4,
  PLAYED: 5,
};

export class ReceiptStore {
  #limit;
  #byId = new Map();

  /**
   * @param {number} [limit] how many message ids to track before evicting the
   *   oldest. A campaign is capped at 200 messages a day
   *   (`DEFAULT_PACING.dailyCap`), and a receipt for a message sent two days
   *   ago is not one anybody is still waiting for.
   */
  constructor(limit = 500) {
    this.#limit = limit;
  }

  /**
   * Record a status for a message and say whether it is news.
   *
   * @param {string | null | undefined} id  `key.id` of the sent message
   * @param {number | null | undefined} status  a `STATUS` value
   * @returns {number | null} the status to relay, or `null` if this is a
   *   duplicate or a regression that must not be sent onward
   */
  observe(id, status) {
    if (!id) return null;
    if (typeof status !== 'number' || !Number.isFinite(status)) return null;

    // A refusal is always news, and never becomes the stored maximum — a
    // message that already reached a device did reach it, whatever arrives
    // afterwards.
    if (status === STATUS.ERROR) return STATUS.ERROR;

    // Below the first tick there is nothing to report: PENDING is this
    // process's own optimism before the server has answered, and the API
    // already knows a send was attempted.
    if (status < STATUS.SERVER_ACK) return null;

    const seen = this.#byId.get(id);
    if (seen !== undefined && status <= seen) return null;

    // Re-seeing an id must not leave it at its original position, or a
    // message still receiving receipts ages out before a quiet one.
    this.#byId.delete(id);
    this.#byId.set(id, status);

    while (this.#byId.size > this.#limit) {
      const oldest = this.#byId.keys().next().value;
      this.#byId.delete(oldest);
    }

    return status;
  }

  /** The highest status seen for a message, or `undefined`. */
  get(id) {
    return this.#byId.get(id);
  }

  get size() {
    return this.#byId.size;
  }
}

/**
 * What WhatsApp's own refusal codes mean, for the ones worth naming.
 *
 * `handleBadAck` puts the literal code string into `messageStubParameters` on
 * the `messages.update` it emits, and it is the single most informative thing
 * this whole service can learn — an ERROR with no code says «واتساب رفضها» and
 * leaves everybody exactly as stuck as «اتبعت» did.
 *
 * `463` is the one that matters here. Baileys 7.x names it
 * `MessageAccountRestriction` and documents it as: a 1:1 message missing its
 * privacy token (`tctoken`), which usually means the account is restricted —
 * WhatsApp blocks it from STARTING new chats while leaving existing
 * conversations working, because an established chat already carries a token.
 *
 * That is the shape of a marketing campaign exactly: every message is a new
 * chat, so every one is refused identically, while a reply typed by hand into
 * a chat that already exists goes through instantly. And the 6.x line this
 * service runs on never attaches a `tctoken` to anything — `getPrivacyTokens`
 * is defined in the library and called from nowhere inside it.
 *
 * An unknown code is passed through verbatim rather than dropped. A number
 * nobody has a sentence for is still the thing to search for.
 */
export const ERROR_CODES = {
  '463': 'واتساب رافض يبدأ محادثات جديدة من الرقم ده (463). المحادثات المفتوحة شغالة عادي.',
  '479': 'واتساب رفض الرسالة (479) — على الأغلب جلسة جهاز قديمة محتاجة ربط من جديد.',
};

/**
 * The status a `message-receipt.update` event implies.
 *
 * This event carries timestamps rather than a status number, and it is the
 * one that fires for a recipient's OWN devices — so it is the more reliable
 * of the two for a 1:1 send. `readTimestamp` outranks `receiptTimestamp`
 * because a message cannot be read without having been delivered, whatever
 * order the two fields arrive in.
 *
 * @param {{ readTimestamp?: unknown, receiptTimestamp?: unknown } | null | undefined} receipt
 * @returns {number | null}
 */
export function statusFromReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  if (receipt.readTimestamp) return STATUS.READ;
  if (receipt.receiptTimestamp) return STATUS.DELIVERY_ACK;
  return null;
}
