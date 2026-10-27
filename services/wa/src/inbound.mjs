/**
 * Who sent an inbound message, and what it said — under LID addressing.
 *
 * ## ⚠️ Why «قف» would have stopped working on Baileys 7 without this
 *
 * The relay used to accept a message only if its `remoteJid` ended in
 * `@s.whatsapp.net` — a phone number. WhatsApp has been moving accounts to
 * LID addressing (`<opaque>@lid`), and Baileys 7 surfaces those chats AS LIDs:
 * the phone number is in `key.remoteJidAlt` when the server sent it, and in
 * the library's LID↔PN mapping otherwise.
 *
 * So the old filter silently dropped every reply from a migrated account —
 * including «قف». A student asking to stop would keep getting campaigns, and
 * nothing anywhere would say the opt-out had been thrown away.
 *
 * The opt-out list is keyed by phone (`marketing_opt_outs.phone`), so the
 * relay must turn a LID back into one. A LID with no known phone number is
 * still dropped, but now it is LOGGED as such by the caller rather than
 * vanishing.
 */

const PN = '@s.whatsapp.net';
const LID = '@lid';

function digitsOf(jid) {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/gu, '');
}

/**
 * The sender's E.164 (`+2010…`), or `null` if this is not a 1:1 message from a
 * person, or if their phone number cannot be determined.
 *
 * @param {{ remoteJid?: string | null, remoteJidAlt?: string | null, fromMe?: boolean | null } | null | undefined} key
 * @param {(lid: string) => Promise<string | null | undefined>} [pnForLid]
 *   the library's own mapping (`signalRepository.lidMapping.getPNForLID`)
 * @returns {Promise<string | null>}
 */
export async function inboundPhone(key, pnForLid) {
  if (!key || key.fromMe) return null;
  const jid = key.remoteJid ?? '';

  if (jid.endsWith(PN)) return `+${digitsOf(jid)}`;
  if (!jid.endsWith(LID)) return null; // groups, broadcasts, newsletters

  const alt = key.remoteJidAlt ?? '';
  if (alt.endsWith(PN)) return `+${digitsOf(alt)}`;

  if (pnForLid) {
    try {
      const pn = await pnForLid(jid);
      if (pn && String(pn).endsWith(PN)) return `+${digitsOf(pn)}`;
    } catch {
      // The mapping store failing is "unknown", not a reason to crash the
      // listener that every other inbound message also goes through.
    }
  }
  return null;
}

/**
 * The text of a message, looking through the wrappers WhatsApp puts around it.
 *
 * A chat with disappearing messages on wraps every message in
 * `ephemeralMessage`; view-once wraps in `viewOnceMessage*`. The old reader
 * looked only at the top level, so «قف» sent into a chat with disappearing
 * messages turned on read as an empty message and was skipped.
 *
 * @param {Record<string, any> | null | undefined} message  `WAMessage.message`
 * @returns {string}
 */
export function inboundText(message) {
  let m = message;
  // A handful of levels is all WhatsApp ever nests; the bound is so a
  // malformed payload cannot loop.
  for (let depth = 0; depth < 4 && m; depth += 1) {
    const inner =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.viewOnceMessageV2Extension?.message ??
      m.documentWithCaptionMessage?.message ??
      m.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  if (!m) return '';
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    ''
  );
}
