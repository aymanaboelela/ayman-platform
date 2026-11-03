/**
 * «احفظهم في واتساب» — one student into the account's OWN contact list.
 *
 * ## What this writes, and where
 *
 * Not a message. A `contactAction` app-state patch (Baileys 7
 * `sock.addOrEditContact(jid, action)` → `chatModify({ contact })` →
 * `appPatch`, collection `critical_unblock_low`, index `['contact', jid]`) —
 * the same mutation WhatsApp Web sends when somebody adds a contact from the
 * keyboard. It syncs to every linked device and to the phone.
 *
 * `saveOnPrimaryAddressbook: false` is the whole point: the instructor will
 * not have four thousand students in his phone's address book. The proto
 * field is WhatsApp's own («Sync contact to phone» off); whether the phone
 * honours it depends on «الخصوصية ← جهات الاتصال ← جهات اتصال واتساب» being on
 * there — the first real test checks exactly that.
 *
 * ## The index is the PHONE jid, never the LID
 *
 * WhatsApp's own clients write `['contact', '<pn>@s.whatsapp.net']` and carry
 * the LID inside the action (`lidJid`) — `processContactAction` in Baileys
 * reads it back that way. An index in LID form is silently ignored
 * (WhiskeySockets/Baileys#2241).
 *
 * ## Why nothing here paces
 *
 * Pacing, the daily cap and «stop on the first refusal» live in the API
 * (`wa-contacts-runner.service.ts`), like every other decision about WHEN.
 * This puts one contact on the wire when told to and says what happened.
 */

/** WhatsApp's own editor cuts names around here; a longer one is a paste accident. */
export const CONTACT_NAME_MAX = 60;

/** One contact may not hold the serialised queue longer than this. */
export const CONTACT_SAVE_TIMEOUT_MS = 20_000;

/**
 * The name as WhatsApp will show it: whitespace folded, bidi/control marks
 * stripped (a pasted RLM is invisible on the screen and in the list), capped.
 * `''` when nothing printable is left — the caller refuses that.
 *
 * @param {unknown} raw
 */
export function contactName(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, CONTACT_NAME_MAX)
    .trim();
}

/**
 * The `ContactAction` proto body. `lidJid` only when the library's LOCAL
 * mapping already knows it — never a second network lookup per contact on
 * top of the existence check: bulk number lookups are the scraping pattern
 * that gets accounts flagged.
 *
 * @param {string} name already passed through `contactName`
 * @param {string | null | undefined} lid
 */
export function contactAction(name, lid) {
  const action = {
    fullName: name,
    firstName: name.split(' ')[0] || name,
    saveOnPrimaryAddressbook: false,
  };
  if (typeof lid === 'string' && lid.endsWith('@lid')) action.lidJid = lid;
  return action;
}

/** Rejects (does not resolve a fallback, unlike `withTimeout`) after `ms`. */
function deadline(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('whatsapp did not confirm the contact in time'), { status: 504 })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Saves one contact. Throws for anything that is not a clean yes, so the API
 * stops the run on it.
 *
 * @param {object} socket   a connected Baileys 7 socket
 * @param {{ jid: string, name: string }} input
 * @param {{ blocked?: () => (null | { reason: string, until?: Date | null }),
 *           lidFor?: (jid: string) => Promise<string | null>,
 *           timeoutMs?: number }} [deps]
 * @returns {Promise<{ saved: boolean, onWhatsApp: boolean, jid: string, lid: string | null }>}
 */
export async function saveContact(socket, { jid, name }, deps = {}) {
  const clean = contactName(name);
  if (!clean) throw Object.assign(new Error('name is empty'), { status: 400 });
  if (typeof socket?.addOrEditContact !== 'function') {
    throw Object.assign(new Error('this Baileys build cannot write contacts'), { status: 501 });
  }

  /*
   * ⚠️ Nothing unusual while WhatsApp is already restricting this account.
   * A contact is not a chat, but an account under a reach-out timelock is an
   * account WhatsApp is watching, and four hundred app-state writes are not
   * what it should see next. Same 423 shape as `/send`, so the API pauses
   * the same way.
   */
  const blocked = deps.blocked?.() ?? null;
  if (blocked) {
    throw Object.assign(new Error(`whatsapp is restricting this account (${blocked.reason})`), {
      status: 423,
      extra: { code: blocked.reason, until: blocked.until?.toISOString?.() ?? null },
    });
  }

  // The same existence check WhatsApp Web runs when a number is typed into
  // «جهة اتصال جديدة». `?? []`: an empty answer is a hiccup, not a verdict.
  const [check] = (await socket.onWhatsApp(jid)) ?? [];
  if (!check) throw Object.assign(new Error('whatsapp gave no answer about the number'), { status: 502 });
  if (!check.exists) return { saved: false, onWhatsApp: false, jid, lid: null };

  const lid = (await deps.lidFor?.(jid).catch?.(() => null)) ?? null;
  await deadline(socket.addOrEditContact(jid, contactAction(clean, lid)), deps.timeoutMs ?? CONTACT_SAVE_TIMEOUT_MS);
  return { saved: true, onWhatsApp: true, jid, lid };
}
