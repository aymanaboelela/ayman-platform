/**
 * The last few messages this process sent, so a failed decryption on the far
 * end can be answered.
 *
 * ## Why a sender has to remember what it said
 *
 * WhatsApp is end-to-end encrypted per RECIPIENT, and a recipient can fail to
 * decrypt for reasons that have nothing to do with the sender being wrong: a
 * ratchet that got ahead of itself, a device that was offline across a key
 * rotation, or — much the most common — a brand-new session, because the first
 * message to a number the sender has never written to before is the one with
 * no established session behind it.
 *
 * When that happens the recipient's phone does NOT show an error. It shows the
 * message as pending forever — «الرسالة بتتحمّل» — and asks the sender, over
 * the wire, to send it again. Baileys answers that request by calling the
 * `getMessage` hook it was configured with, re-encrypting whatever comes back
 * and delivering it.
 *
 * With no `getMessage` there is nothing to re-encrypt, the retry receipt goes
 * unanswered, and the message stays unreadable permanently. That is what was
 * shipping: `makeWASocket` was configured without one, so every message that
 * needed a second attempt — disproportionately the FIRST one to each student,
 * which is the only one a campaign ever sends — could never get it.
 *
 * ## Why in memory, and why a cap
 *
 * A retry arrives within seconds to minutes of the original, while the process
 * that sent it is still up; a retry for a message sent before a redeploy is
 * not worth a database. The cap exists because this store must never be able
 * to grow into the reason the container dies: a campaign is capped at 200
 * messages a day (`DEFAULT_PACING.dailyCap`), so 500 covers more than two full
 * days of sending and still holds only text.
 *
 * Insertion order is the eviction order — a Map iterates in insertion order,
 * so the oldest key is simply the first one.
 */
export class SentStore {
  #limit;
  #byId = new Map();

  /** @param {number} [limit] how many messages to keep before evicting the oldest */
  constructor(limit = 500) {
    this.#limit = limit;
  }

  /**
   * Remember one sent message.
   *
   * @param {string | null | undefined} id  `key.id` from `sendMessage`'s result
   * @param {unknown} message  the `message` field of that same result — the
   *   protobuf Baileys will re-encrypt, NOT the text that went into it
   */
  remember(id, message) {
    // A send with no id cannot be looked up by one, and a send with no message
    // body has nothing to re-encrypt. Storing either would only ever produce a
    // `getMessage` that resolves to garbage, which is worse than one that
    // resolves to nothing: Baileys treats `undefined` as "I cannot help" and
    // stops, where a malformed body is delivered as a malformed message.
    if (!id || !message) return;

    // Re-remembering an id must not leave it in its ORIGINAL position, or a
    // message that is re-sent stays near the eviction end and can be dropped
    // while newer, less contested messages survive.
    this.#byId.delete(id);
    this.#byId.set(id, message);

    while (this.#byId.size > this.#limit) {
      const oldest = this.#byId.keys().next().value;
      this.#byId.delete(oldest);
    }
  }

  /**
   * What Baileys asks for on a retry receipt.
   *
   * Returns `undefined` for anything not held — a message from before a
   * redeploy, or one already evicted. That is the honest answer and Baileys
   * handles it; inventing a body would deliver the wrong message to somebody.
   *
   * @param {{ id?: string | null } | null | undefined} key
   */
  get(key) {
    const id = key?.id;
    if (!id) return undefined;
    return this.#byId.get(id);
  }

  get size() {
    return this.#byId.size;
  }
}
