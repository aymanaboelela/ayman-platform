import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import makeWASocket, {
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { clearAuthDir } from './auth-store.mjs';
import { fenceAuthState } from './auth-fence.mjs';
import { ConnectWatchdog } from './connect-watchdog.mjs';
import { inboundPhone, inboundText } from './inbound.mjs';
import { waitForLinkProgress } from './link-wait.mjs';
import { NewChatLimits } from './new-chat-limits.mjs';
import { ReceiptStore, STATUS, statusFromReceipt } from './receipt-store.mjs';
import { Backoff, classifyClose } from './reconnect-policy.mjs';
import { SentStore } from './sent-store.mjs';
import { withTimeout } from './with-timeout.mjs';

/**
 * One WhatsApp device, one message at a time.
 *
 * Everything about WHEN to send lives in the API. This process knows how to
 * hold a session, how to answer whether it is holding one, and how to put one
 * message on the wire. That division is the whole reason it is a separate
 * container — see README.md.
 *
 * ## Baileys 7
 *
 * This runs on the 7.x line (pinned, `package.json`). The reasons, in order:
 *
 *   · **privacy tokens.** 6.x never attached a `tctoken` to anything and
 *     never issued ours to a contact. 7.x does both: it attaches the
 *     contact's token when one is stored, and after every 1:1 send it issues
 *     OUR token to the recipient so the chat becomes "trusted" from then on —
 *     which is how a brand-new number's chats stop being new chats.
 *   · **WhatsApp's own new-chat limits are readable.** The reach-out timelock
 *     and the new-chat message cap — see `new-chat-limits.mjs`. This is what
 *     lets `send()` refuse to send INTO a restriction instead of discovering
 *     it as a 463 on every message (each of which, per Baileys' own source,
 *     makes the restriction worse).
 *   · **LID addressing.** 7.x keeps the LID↔PN mapping itself, encrypts to
 *     the right identity, and surfaces inbound LID chats — which the relay
 *     below has to turn back into phone numbers (`inbound.mjs`).
 *   · **no git dependency.** 6.x pulled `libsignal` from a GitHub commit; 7.x
 *     takes it from the registry, so the lockfile carries an integrity hash.
 */

const PORT = Number(process.env.WA_PORT ?? 3400);
const TOKEN = process.env.WA_TOKEN ?? '';
const AUTH_DIR = process.env.WA_AUTH_DIR ?? './.wa-auth';

/**
 * The name this pairing shows up as in the phone's «الأجهزة المرتبطة» list.
 *
 * Was the literal 'Ayman Platform'. Every stack runs this same image, so on a
 * second instructor's handset that string named the wrong person — and this is
 * the one label the phone's OWNER reads when deciding whether a linked device
 * is legitimate. An entry nobody recognises is one that eventually gets
 * revoked, which silently stops that tenant's WhatsApp.
 *
 * Falls back to Ayman's name only when this stack has not been told it is
 * somebody else, the same rule as `TENANT_CONTACT_SEED` in the API: a stack
 * that identifies itself as another tenant and forgets `WA_DEVICE_NAME` gets
 * its own key, never his name.
 */
const TENANT_KEY = (process.env.TENANT_KEY ?? '').trim() || 'ayman';
const DEVICE_NAME =
  (process.env.WA_DEVICE_NAME ?? '').trim() ||
  (TENANT_KEY === 'ayman' ? 'Ayman Platform' : `${TENANT_KEY} Platform`);
const INBOUND_URL = process.env.WA_INBOUND_URL ?? '';
/**
 * Where delivery receipts go. Optional in the same way `WA_INBOUND_URL` is —
 * an unset one leaves the sidecar sending exactly as before, it does not
 * break it.
 *
 * ⚠️ Unset in production is the state this whole file exists to escape: with
 * nothing here, `sendMessage` resolving is again the only signal, the API
 * again records `sent` for a message WhatsApp accepted and never delivered,
 * and the campaign screen again reports «٧٤ من ٧٤» for a run that reached
 * nobody. Set it.
 */
const RECEIPT_URL = process.env.WA_RECEIPT_URL ?? '';

if (!TOKEN) {
  console.error('WA_TOKEN is required — refusing to start an unauthenticated sender');
  process.exit(1);
}

/**
 * Two levels, deliberately, and `info` is the default for OURS.
 *
 * This service sends at most a couple of hundred messages a day, and the
 * lesson of 2026-09 is that its logs were the only place the truth could have
 * been and nobody had written anything there. One line per send costs nothing
 * and is the first thing anybody will look for after the next silent failure.
 *
 * Baileys keeps `warn`: at `info` the library narrates every handshake, every
 * app-state sync and every receipt, which would bury our own lines in exactly
 * the log somebody is grepping. `warn` still carries «received error in ack»
 * and «error 463» — where WhatsApp's refusal codes appear.
 */
const logger = pino({ level: process.env.WA_LOG_LEVEL ?? 'info' });
const baileysLogger = logger.child({}, { level: process.env.WA_BAILEYS_LOG_LEVEL ?? 'warn' });

/** `disconnected` | `linking` | `connected`. Mirrors the contract's enum. */
let state = 'disconnected';
/** A `data:image/png;base64,…` QR while pairing, else null. */
let qr = null;
/**
 * An 8-character code for «اربط برقم التليفون» — the alternative to the QR,
 * for the case the QR cannot serve: the admin page open ON the very phone that
 * is being linked, which cannot scan its own screen.
 */
let pairingCode = null;
/** Digits of the number the operator asked to pair by code, until it pairs. */
let pairingPhone = null;
let phone = null;
let detail = null;
/** When the current session reached `open`. */
let connectedAt = null;
/** When `sendMessage` last resolved — the first tick, not delivery. */
let lastSentAt = null;
/** The most recent refusal WhatsApp sent us: `{ code, at }`. */
let lastRefusal = null;
let sock = null;
/** Set while `connect()` is in flight, so two callers do not race a socket. */
let connecting = null;
/** The pending reconnect, so `/unlink` can cancel it — see there. */
let reconnectTimer = null;

/**
 * The in-flight credential wipe, if any — `connect()` waits on it.
 *
 * The revoked-device clear below cannot be awaited where it happens: it runs
 * inside a `connection.update` listener, and a listener that returns a promise
 * is a promise nobody holds. So the promise is parked here instead, and the
 * next `connect()` waits for it before reading the directory — otherwise an
 * operator pressing «اربط رقم جديد» quickly enough could have
 * `useMultiFileAuthState` load the very credentials being deleted underneath
 * it, and get answered with the same 401 the clear existed to escape.
 */
let clearing = Promise.resolve();

/**
 * Bumped on every `connect()` attempt. A socket we have force-ended (see
 * `forceReset`) can still fire a late `connection.update` after a NEWER
 * attempt has already started — this lets that stale closure recognise
 * itself as superseded and no-op, instead of stomping on state that now
 * belongs to the current attempt. The same number fences the auth directory
 * against the replaced socket's late writes (`auth-fence.mjs`).
 */
let generation = 0;

/**
 * How long a single handshake attempt may go without ANY progress — not
 * even a QR refresh — before it counts as wedged rather than merely slow.
 * See `connect-watchdog.mjs` for why this is safe against a legitimately
 * long wait for a human to scan a code.
 */
const CONNECT_TIMEOUT_MS = Number(process.env.WA_CONNECT_TIMEOUT_MS ?? 30_000);
/** How often we check the watchdog while an attempt is in flight. */
const WATCHDOG_POLL_MS = 5000;
/**
 * Extra margin past `CONNECT_TIMEOUT_MS` before `/health` itself calls a
 * stuck attempt unhealthy. A backstop for `forceReset` failing to run at all,
 * not a shorter, competing timeout.
 */
const HEALTH_GRACE_MS = 60_000;

/**
 * How long `POST /link` waits for the handshake to produce something worth
 * answering with — a QR, a pairing code, or a finished connection.
 *
 * `connect()` resolves as soon as the socket OBJECT exists, which is long
 * before WhatsApp has issued a code. Answering at that moment hands the admin
 * screen the pre-click state, so the button reads as broken. The API side has
 * a matching `LINK_TIMEOUT_MS` (20s) for this one route. A ceiling, not a
 * delay: the loop returns the instant there is a code.
 */
const LINK_QR_WAIT_MS = Number(process.env.WA_LINK_QR_WAIT_MS ?? 10_000);
/** Granularity of that wait. Short enough to feel immediate. */
const LINK_QR_POLL_MS = 250;

/** See `with-timeout.mjs`. */
const VERSION_FETCH_TIMEOUT_MS = 5000;

/**
 * How stale WhatsApp's answer about new-chat limits may be before a send asks
 * again. Pushed updates arrive on their own; this is for the ones that do not.
 */
const LIMITS_MAX_AGE_MS = 30 * 60_000;
/** Never ask more often than this, however many 463s arrive at once. */
const LIMITS_MIN_GAP_MS = 60_000;
const LIMITS_QUERY_TIMEOUT_MS = 5000;

const connectWatchdog = new ConnectWatchdog(CONNECT_TIMEOUT_MS);
let watchdogTimer = null;
const backoff = new Backoff();
const limits = new NewChatLimits();
let limitsAskedAt = 0;

function armWatchdog() {
  connectWatchdog.touch();
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    if (connectWatchdog.isStuck()) forceReset('connect attempt timed out with no progress');
  }, WATCHDOG_POLL_MS);
}

function disarmWatchdog() {
  connectWatchdog.disarm();
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function scheduleReconnect(delay, options = {}) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(options).catch((error) => logger.error({ err: error }, 'reconnect failed'));
  }, delay);
}

function cancelReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

/**
 * Detaches and closes a socket that is no longer the live one. Its listeners
 * go first, so nothing it emits on the way down can reach module state; its
 * auth writes are already fenced by the generation bump the caller made.
 */
function retire(stale, reason) {
  if (!stale) return;
  try {
    stale.ev.removeAllListeners();
  } catch {
    // An emitter that is already torn down has nothing left to remove.
  }
  try {
    stale.end(new Error(reason));
  } catch (error) {
    logger.warn({ err: error }, 'wa: closing a retired socket failed');
  }
}

/**
 * Declares the in-flight attempt dead and puts the module back in a state
 * where the NEXT `/link` genuinely starts a fresh attempt, instead of
 * `connecting` staying non-null forever and every future call short-
 * circuiting on `if (connecting) return connecting` — the 2026-08-27 bug.
 */
function forceReset(reason) {
  disarmWatchdog();
  generation += 1;
  const stale = sock;
  sock = null;
  connecting = null;
  state = 'disconnected';
  qr = null;
  pairingCode = null;
  detail = reason;
  logger.warn({ reason }, 'wa connect watchdog: resetting a wedged attempt');
  retire(stale, reason);
  // Not interactive: a paired device comes back on its own; an unpaired one
  // waits for somebody to press «اربط» rather than minting QR codes for
  // nobody (see `connect`).
  scheduleReconnect(backoff.next());
}

/**
 * What has been sent recently, for answering retry receipts — see
 * `sent-store.mjs`. Outside `connect()`: a retry can arrive after the socket
 * that sent the message has dropped and reconnected.
 */
const sent = new SentStore();

/**
 * The highest status WhatsApp has reported for each message we sent, and its
 * refusal code if it refused one. Outside `connect()` for the same reason as
 * `sent`. Not durable, and deliberately so: the API is the record.
 */
const receipts = new ReceiptStore();

/**
 * A single in-flight send at a time. Two concurrent `sendMessage` calls on one
 * Baileys socket is a class of bug nobody wants to debug.
 */
let queue = Promise.resolve();

/**
 * The number a send is in flight to (E.164), from just before `sendMessage` until its
 * id is in `sent`. Closes the one window where our own message could be
 * relayed back as somebody typing on the handset. Sends are serialised, so
 * one value is enough.
 */
let sending = null;

function digitsOf(value) {
  return String(value).replace(/\D/gu, '');
}

function jidFor(value) {
  return `${digitsOf(value)}@s.whatsapp.net`;
}

/** An error the HTTP layer answers with its own status and fields. */
function httpError(status, message, extra = {}) {
  return Object.assign(new Error(message), { status, extra });
}

/**
 * Whether these credentials belong to a device WhatsApp actually paired.
 *
 * `creds.account` is the signed device identity written on pair-success, and
 * nothing else writes it. `creds.me` alone is NOT enough: requesting a pairing
 * code sets `me` before anybody has typed the code into a phone.
 */
function isPaired(creds) {
  return Boolean(creds?.me?.id && creds?.account);
}

async function waVersion() {
  const result = await withTimeout(fetchLatestBaileysVersion(), VERSION_FETCH_TIMEOUT_MS, null);
  // `isLatest: false` is the library's own fallback — the version it ships —
  // which is exactly what omitting `version` gives, so only a real answer is
  // passed on.
  return result?.isLatest ? result.version : undefined;
}

/**
 * Asks WhatsApp what it currently allows this account to do about new chats.
 * Best effort: both are GraphQL queries an account may not be eligible for,
 * and an error leaves the last known answer in place.
 */
async function refreshLimits(socket, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - limitsAskedAt < LIMITS_MAX_AGE_MS) return;
  if (now - limitsAskedAt < LIMITS_MIN_GAP_MS) return;
  limitsAskedAt = now;

  const [lock, cap] = await Promise.all([
    withTimeout(socket.fetchAccountReachoutTimelock?.(), LIMITS_QUERY_TIMEOUT_MS, null),
    withTimeout(socket.fetchNewChatMessageCap?.(), LIMITS_QUERY_TIMEOUT_MS, null),
  ]);
  if (socket !== sock) return;
  if (lock) limits.observeTimelock(lock);
  if (cap) limits.observeCap(cap);
  if (lock || cap) logger.info({ limits: limits.snapshot() }, 'wa: new-chat limits');
}

/**
 * Whether the recipient has given us a privacy token — i.e. this is an
 * EXISTING trusted chat, which a new-chat restriction does not apply to.
 * Baileys 7 stores them under the contact's LID when it knows one.
 */
async function hasTrustedToken(socket, jid) {
  try {
    const lid = await socket.signalRepository?.lidMapping?.getLIDForPN?.(jid);
    const ids = [lid, jid].filter(Boolean);
    const stored = await socket.authState.keys.get('tctoken', ids);
    return ids.some((id) => stored?.[id]?.token?.length > 0);
  } catch {
    return false;
  }
}

/**
 * Opens (or re-opens) the socket.
 *
 * `useMultiFileAuthState` reads the volume: on a redeploy the credentials are
 * already there and the phone is never asked to scan anything again. That is
 * the single most important property of this file.
 *
 * ## `interactive`
 *
 * Only `POST /link` passes `true`. Every other caller — boot, a reconnect, the
 * watchdog — is a machine, and a machine reconnecting a device that was never
 * paired is just asking WhatsApp for QR codes nobody will ever scan. It used
 * to do exactly that, forever: an unpaired sidecar opened a pairing session at
 * boot, WhatsApp closed it 408 after the QR rotation ran out, and the 5s
 * reconnect opened another — thousands of throwaway handshakes a day against
 * the very service whose trust the number depends on. Now an unpaired device
 * stays quiet until a human asks.
 */
async function connect({ interactive = false } = {}) {
  if (connecting) return connecting;

  const myGeneration = ++generation;
  const isCurrent = () => myGeneration === generation;
  armWatchdog();

  connecting = (async () => {
    // Never read the auth directory while it is being emptied — see `clearing`.
    await clearing.catch(() => undefined);
    const loaded = await useMultiFileAuthState(AUTH_DIR);

    if (!interactive && !isPaired(loaded.state.creds)) {
      disarmWatchdog();
      connecting = null;
      return;
    }

    const { state: auth, saveCreds } = fenceAuthState(loaded.state, loaded.saveCreds, isCurrent);
    const version = await waVersion();

    // A watchdog reset (or a fresh `/unlink`) may have superseded this
    // attempt while the awaits above were in flight.
    if (!isCurrent()) return;

    const socket = makeWASocket({
      ...(version ? { version } : {}),
      auth: {
        creds: auth.creds,
        // The library's own in-memory cache in front of the files: a 7.x send
        // reads device lists, sessions, LID mappings and tokens per message,
        // and every one of those was a disk read without it.
        keys: makeCacheableSignalKeyStore(auth.keys, baileysLogger),
      },
      logger: baileysLogger,
      // How the pairing shows up in the phone's «الأجهزة المرتبطة» list.
      browser: Browsers.ubuntu(DEVICE_NAME),
      // Presence is not broadcast. A sender that appears permanently online
      // is a bot tell, and there is nobody on this end to be online.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      // ⚠️ WITHOUT THIS, A MESSAGE THAT FAILS TO DECRYPT NEVER ARRIVES.
      //
      // A recipient that cannot decrypt asks the sender to send it again, and
      // this hook is how Baileys answers. It bites hardest on the FIRST
      // message to a number — which, on a new number, is every message. 7.x
      // also keeps a recent-message cache of its own; this is the fallback
      // that survives that cache's eviction. See `sent-store.mjs`.
      getMessage: async (key) => sent.get(key),
    });
    sock = socket;

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => onConnectionUpdate(update, socket, myGeneration));
    socket.ev.on('message-capping.update', (info) => {
      if (isCurrent()) limits.observeCap(info);
    });

    if (INBOUND_URL) socket.ev.on('messages.upsert', (upsert) => onIncoming(upsert, socket));

    // ⚠️ THE SECOND TICK. Registered per socket, because `connect()` builds a
    // new one on every reconnect and a listener bound to a dead socket hears
    // nothing. See `receipt-store.mjs`.
    if (RECEIPT_URL) {
      socket.ev.on('messages.update', (updates) => onStatusUpdates(updates, socket));
      socket.ev.on('message-receipt.update', onReceiptUpdates);
    }
  })();

  try {
    await connecting;
  } catch (error) {
    if (isCurrent()) {
      disarmWatchdog();
      connecting = null;
    }
    throw error;
  }
  return undefined;
}

function onConnectionUpdate(update, socket, myGeneration) {
  // A stale event from a socket already replaced — ignore it rather than
  // clobber current state.
  if (myGeneration !== generation) return;

  // Any update at all — a QR reissue included — is proof this attempt is
  // still alive, so push the wedged-attempt deadline back.
  connectWatchdog.touch();

  if (update.reachoutTimeLock) {
    limits.observeTimelock(update.reachoutTimeLock);
    logger.warn({ limits: limits.snapshot() }, 'wa: reach-out timelock changed');
  }

  if (update.qr) {
    state = 'linking';
    QRCode.toDataURL(update.qr, { margin: 1, width: 320 })
      .then((url) => {
        if (myGeneration === generation) qr = url;
      })
      .catch(() => {
        qr = null;
      });
    // A pairing code can only be requested once the socket is talking to
    // WhatsApp, and the first QR is the signal that it is.
    if (pairingPhone && !pairingCode) requestCode(socket, myGeneration);
  }

  if (update.connection === 'open') {
    disarmWatchdog();
    backoff.reset();
    state = 'connected';
    qr = null;
    pairingCode = null;
    pairingPhone = null;
    detail = null;
    connectedAt = new Date();
    phone = socket.user?.id ? `+${digitsOf(socket.user.id.split('@')[0].split(':')[0])}` : null;
    logger.info({ phone }, 'wa: connected');
    // What WhatsApp allows a new number to do is the first thing worth
    // knowing, before the first send rather than after the first 463.
    refreshLimits(socket, { force: true }).catch(() => undefined);
  }

  if (update.connection === 'close') {
    disarmWatchdog();
    const status = update.lastDisconnect?.error?.output?.statusCode;
    const { action, detail: why } = classifyClose(status);
    const wasLinking = state === 'linking';
    qr = null;
    connectedAt = null;
    detail = why;
    connecting = null;
    sock = null;
    logger.warn({ status, action }, 'wa: connection closed');

    if (action === 'clear-and-wait') {
      state = 'disconnected';
      phone = null;
      pairingCode = null;
      // ⚠️ IF THIS FAILS, THE DEVICE PAGE CAN NEVER RECOVER — say so.
      //
      // Credentials WhatsApp has revoked are replayed by every subsequent
      // `connect()`, which closes 401 again before a QR can be issued. It did
      // exactly that for as long as this called `rm` on the directory itself
      // — see `auth-store.mjs`. The failure is carried into `detail`, the one
      // channel the admin screen actually shows.
      generation += 1;
      clearing = clearAuthDir(AUTH_DIR);
      clearing
        .then(({ removed }) => logger.warn({ removed }, 'wa: device revoked — pairing credentials cleared'))
        .catch((error) => {
          detail = `logged out, and clearing the credentials failed: ${error.code ?? error.message}`;
          logger.error({ err: error, dir: AUTH_DIR }, 'wa: could not clear revoked credentials');
        });
      return;
    }

    if (action === 'stop') {
      state = 'disconnected';
      return;
    }

    if (action === 'reconnect-now') {
      // 515 right after a scan: the pairing worked. Keep saying «بيتربط»
      // through the restart instead of flashing «مفيش رقم متربط».
      // Interactive, because the credentials the scan just produced may still
      // be on their way to disk: a reconnect that judged "paired?" from a
      // half-written `creds.json` would otherwise sit silent instead of
      // finishing the pairing.
      state = wasLinking ? 'linking' : 'disconnected';
      scheduleReconnect(250, { interactive: true });
      return;
    }

    state = 'disconnected';
    // A pairing attempt that ran out of QR codes (408) is not reconnected:
    // `connect()` would refuse anyway — nobody is paired — and the operator's
    // next click starts a fresh one.
    scheduleReconnect(backoff.next());
  }
}

function requestCode(socket, myGeneration) {
  const digits = pairingPhone;
  socket
    .requestPairingCode(digits)
    .then((code) => {
      if (myGeneration !== generation) return;
      // Shown as XXXX-XXXX, the way the phone's own screen groups it.
      pairingCode = code ? `${code.slice(0, 4)}-${code.slice(4)}` : null;
      logger.info('wa: pairing code issued');
    })
    .catch((error) => {
      if (myGeneration !== generation) return;
      detail = `pairing code failed: ${error?.message ?? 'unknown'}`;
      logger.warn({ err: error }, 'wa: pairing code request failed');
    });
}

/**
 * Forwards what people reply, so «قف» can stop a campaign and the API's
 * auto-reply bot can answer.
 *
 * Only personal chats — never groups, never status broadcasts — and under
 * LID addressing too (see `inbound.mjs`, which is the reason this is no
 * longer a plain `endsWith('@s.whatsapp.net')`). The API decides what a
 * message means; this just relays it, and a failure to relay is logged and
 * dropped rather than retried: the next message carries the same intent, and
 * a retry storm against the API is worse than a missed one.
 *
 * ## Our own messages: only the ones a PERSON typed
 *
 * A reply somebody types on the linked handset itself is relayed with
 * `fromMe: true` — it is what tells the bot a human has taken the chat over.
 * Everything THIS process sent is not: those arrive as `append` (Baileys'
 * own-event echo) rather than `notify`, and the `sent` store and `sending`
 * below catch the rest, so the bot never mistakes its own reply for a person.
 */
async function onIncoming({ messages, type }, socket) {
  if (type !== 'notify') return;
  const lidMapping = socket.signalRepository?.lidMapping;
  const pnForLid = lidMapping?.getPNForLID ? (lid) => lidMapping.getPNForLID(lid) : undefined;

  for (const message of messages ?? []) {
    const fromMe = Boolean(message.key?.fromMe);
    if (fromMe && sent.get(message.key)) continue;
    const text = inboundText(message.message);
    if (!text) continue;

    // `inboundPhone` answers null for our own messages by design; a reply typed
    // on the handset is asked about as the chat it was typed INTO.
    const from = await inboundPhone(fromMe ? { ...message.key, fromMe: false } : message.key, pnForLid);
    if (!from) {
      if (String(message.key?.remoteJid ?? '').endsWith('@lid')) {
        logger.warn({ jid: message.key?.remoteJid }, 'inbound from a LID with no known phone number — not relayed');
      }
      continue;
    }
    if (fromMe && sending === from) continue;

    try {
      await fetch(INBOUND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-wa-token': TOKEN },
        body: JSON.stringify({
          phone: from,
          text: text.slice(0, 1000),
          // What they call themselves — display text for the leads list only.
          name: fromMe ? null : (message.pushName ?? null),
          // For the API to record a message relayed twice only once.
          messageId: message.key?.id ?? null,
          fromMe,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      logger.warn({ err: error }, 'inbound relay failed');
    }
  }
}

/**
 * Tells the API what actually happened to a message after it left.
 *
 * Without it the only success signal this service produces is
 * `sendMessage()` resolving — ONE GREY TICK — and the API wrote `sent` for
 * messages delivered to nobody (see `receipt-store.mjs`).
 *
 * Best effort, deliberately: the next receipt for the same message carries
 * the same information and the API's merge is highest-status-wins.
 *
 * @param {number} status a `STATUS` value
 */
async function relayReceipt(id, status, code = null, socket = null) {
  const news = receipts.observe(id, status, code);
  if (news === null) return;

  // ⚠️ A refusal without its code is barely better than no refusal at all —
  // `463` is an answer, «واتساب رفضها» is not. Logged at warn as well as
  // relayed, because this is also the line somebody will grep for.
  if (news === STATUS.ERROR) {
    lastRefusal = { code, at: new Date().toISOString() };
    logger.warn({ messageId: id, code }, 'whatsapp refused a message');
    // 463 is WhatsApp saying "you may not start this chat". Ask it why and
    // until when, so the device page — and the next `send()` — know.
    if (code === '463' && socket) refreshLimits(socket, { force: true }).catch(() => undefined);
  }

  try {
    await fetch(RECEIPT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wa-token': TOKEN },
      // The CODE, not a sentence: what it means in Arabic is the API's job
      // (`marketing.waErrors` in the contracts copy), so the campaign screen,
      // the device page and the test send all say the same thing.
      body: JSON.stringify({ messageId: id, status: news, code }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    logger.warn({ err: error, messageId: id, status: news }, 'receipt relay failed');
  }
}

/**
 * `messages.update` — a numeric status, and on a refusal the code that says
 * why: `handleBadAck` puts WhatsApp's literal error code into
 * `messageStubParameters[0]`.
 */
async function onStatusUpdates(updates, socket) {
  for (const entry of updates ?? []) {
    // Only our own messages have a delivery status worth reporting.
    if (entry?.key?.fromMe === false) continue;
    const code = entry?.update?.messageStubParameters?.[0];
    await relayReceipt(entry?.key?.id, entry?.update?.status, code ? String(code) : null, socket);
  }
}

/** `message-receipt.update` — timestamps rather than a status. */
async function onReceiptUpdates(updates) {
  for (const entry of updates ?? []) {
    if (entry?.key?.fromMe === false) continue;
    const status = statusFromReceipt(entry?.receipt);
    if (status === null) continue;
    await relayReceipt(entry?.key?.id, status);
  }
}

async function send({ phone: to, text, imageUrl }) {
  const socket = sock;
  if (state !== 'connected' || !socket) throw httpError(409, 'device is not connected');

  const jid = jidFor(to);

  // Ask WhatsApp whether the number has an account before composing anything
  // at it — repeated sends to non-existent numbers are one of the signals that
  // get a number flagged. `?? []`: an empty answer is a server hiccup, not a
  // verdict, and destructuring it bare used to throw out of `/send`.
  const [check] = (await socket.onWhatsApp(jid)) ?? [];
  if (!check?.exists) return { messageId: null, onWhatsApp: false };

  /*
   * ⚠️ DO NOT SEND INTO A RESTRICTION.
   *
   * If WhatsApp has told this account it may not start new chats right now
   * (a reach-out timelock, or the new-chat cap reached), a message to a
   * number with no trusted chat is refused with 463 — and Baileys' own source
   * is explicit that every such attempt counts as another reach-out and
   * deepens the restriction. So it is refused HERE, before the wire, with a
   * status the API turns into «اتوقفت لحد …» rather than a failed recipient.
   *
   * A chat that already carries the recipient's privacy token is not a new
   * chat and goes through — the same rule WhatsApp's own clients apply.
   */
  await refreshLimits(socket).catch(() => undefined);
  const blocked = limits.blocksNewChats();
  if (blocked && !(await hasTrustedToken(socket, jid))) {
    throw httpError(423, `whatsapp is not allowing new chats (${blocked.reason})`, {
      code: blocked.reason,
      until: blocked.until?.toISOString() ?? null,
    });
  }

  // Two small human tells, in the right order: read the chat, then appear to
  // type for a moment proportional to the message.
  await socket.presenceSubscribe(jid).catch(() => undefined);
  await socket.sendPresenceUpdate('composing', jid).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, Math.min(6000, 800 + text.length * 25)));
  await socket.sendPresenceUpdate('paused', jid).catch(() => undefined);

  const payload = imageUrl ? { image: { url: imageUrl }, caption: text } : { text };

  sending = `+${digitsOf(jid.split('@')[0])}`;
  let message;
  try {
    message = await socket.sendMessage(jid, payload);
  } catch (error) {
    sending = null;
    throw error;
  }
  lastSentAt = new Date();

  // The recipient's LID, once 7.x has learned it. Reported, never addressed:
  // the library picks the right identity to encrypt to on its own.
  const lid = await withTimeout(socket.signalRepository?.lidMapping?.getLIDForPN?.(jid), 1000, null);

  logger.info({ messageId: message?.key?.id ?? null, jid, serverJid: check.jid ?? null, lid }, 'sent');
  // Recorded before returning: a retry receipt can land while the caller is
  // still logging the send.
  sent.remember(message?.key?.id, message?.message);
  sending = null;
  return {
    messageId: message?.key?.id ?? null,
    onWhatsApp: true,
    /** What we addressed. */
    jid,
    /** What WhatsApp says the canonical address is — normally the same. */
    serverJid: check.jid ?? null,
    /** Non-null once this recipient is known by a LID. */
    lid: lid ?? null,
    /** The number that sent it — the API ages its warm-up ceiling by this. */
    sender: phone,
  };
}

/**
 * Forget the paired device: log it out, stop everything it could still do,
 * and empty the auth directory.
 *
 * ## The order is the fix
 *
 * «اربط رقم تاني» is this followed by `/link`, and every step below exists
 * because skipping it let the OLD number come back:
 *
 *   1. cancel a pending reconnect — one scheduled before the click would
 *      otherwise fire during `logout()`, load the still-present credentials
 *      and resume the old session;
 *   2. bump the generation — fences the old socket's late auth writes
 *      (`auth-fence.mjs`) and silences its late events;
 *   3. publish `clearing` BEFORE awaiting anything, so any `connect()` that
 *      does slip in waits for the wipe;
 *   4. empty the directory by its CHILDREN — it is a volume mount point, and
 *      `rm` on the directory itself is a silent no-op (`auth-store.mjs`).
 */
async function unlink() {
  cancelReconnect();
  disarmWatchdog();
  generation += 1;
  const stale = sock;
  sock = null;
  connecting = null;

  const wipe = (async () => {
    if (stale) {
      // Tells WhatsApp to drop this companion, so the old phone's «الأجهزة
      // المرتبطة» list does not keep a dead entry. Bounded: a socket that is
      // already half-dead must not hold the wipe hostage.
      await withTimeout(stale.logout(), 5000, null);
      retire(stale, 'unlinked');
    }
    return clearAuthDir(AUTH_DIR);
  })();
  // Published before anything is awaited — see step 3 above.
  clearing = wipe;

  state = 'disconnected';
  phone = null;
  qr = null;
  pairingCode = null;
  pairingPhone = null;
  detail = null;
  connectedAt = null;
  lastSentAt = null;
  lastRefusal = null;
  limits.reset();
  limitsAskedAt = 0;
  receipts.clear();
  sent.clear();
  backoff.reset();

  return wipe;
}

// ── HTTP ─────────────────────────────────────────────────────────────────

function authorised(request) {
  const provided = Buffer.from(String(request.headers['x-wa-token'] ?? ''));
  const expected = Buffer.from(TOKEN);
  // Length check first: `timingSafeEqual` throws on a mismatch rather than
  // returning false.
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function json(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(text);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    // A send payload is a few hundred bytes. Anything larger is not one.
    if (size > 64 * 1024) throw httpError(413, 'payload too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'body is not JSON');
  }
}

function statusBody() {
  return {
    state,
    phone,
    qr,
    pairingCode,
    detail,
    connectedAt: connectedAt?.toISOString() ?? null,
    lastSentAt: lastSentAt?.toISOString() ?? null,
    lastRefusal,
    limits: limits.snapshot(),
  };
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /health') {
    // Deliberately NOT "is a device linked" — `disconnected` is a perfectly
    // healthy container. The one exception: a connect attempt wedged for far
    // longer than the in-process watchdog should ever have allowed, so Docker
    // can restart a container that would otherwise rot (2026-08-27).
    const stuck = connectWatchdog.overdueBy(HEALTH_GRACE_MS);
    json(
      response,
      stuck ? 503 : 200,
      stuck ? { ok: false, detail: 'connect attempt exceeded timeout without recovering' } : { ok: true },
    );
    return;
  }

  if (!authorised(request)) {
    json(response, 401, { error: 'unauthorised' });
    return;
  }

  (async () => {
    switch (route) {
      case 'GET /status':
        json(response, 200, statusBody());
        return;

      case 'POST /link': {
        // `{ phone }` asks for an 8-character pairing code instead of (as
        // well as) the QR — for linking from the same phone that shows the
        // admin page. Optional; an empty body is the QR flow, as before.
        const body = await readBody(request);
        const digits = body.phone ? digitsOf(body.phone) : '';
        if (body.phone && (digits.length < 10 || digits.length > 15)) {
          json(response, 400, { error: 'phone must be the full international number' });
          return;
        }

        // Idempotent: linking an already-connected device is a no-op rather
        // than a reset, so a double click cannot drop a working session.
        if (state !== 'connected') {
          if (digits) {
            pairingPhone = digits;
            pairingCode = null;
            // An attempt already showing a QR can switch to a code at once.
            if (sock && state === 'linking') requestCode(sock, generation);
          }
          await connect({ interactive: true });
          const why = await waitForLinkProgress(
            () => ({ qr: pairingPhone ? pairingCode : qr, state }),
            { timeoutMs: LINK_QR_WAIT_MS, pollMs: LINK_QR_POLL_MS },
          );
          if (why === 'timeout') {
            logger.warn({ state, detail }, 'wa /link: no code within the wait — answering with current state');
          }
        }
        json(response, 200, statusBody());
        return;
      }

      case 'POST /unlink': {
        // Not swallowed: this route exists BECAUSE the operator is trying to
        // recover or replace a pairing, and answering `ok` to a clear that
        // cleared nothing is how a stuck state survived being told to go away.
        try {
          const { removed } = await unlink();
          logger.warn({ removed }, 'wa /unlink: pairing credentials cleared');
        } catch (error) {
          detail = `clearing the credentials failed: ${error.code ?? error.message}`;
          logger.error({ err: error, dir: AUTH_DIR }, 'wa /unlink: could not clear credentials');
          json(response, 500, { error: detail });
          return;
        }
        json(response, 200, { ok: true });
        return;
      }

      case 'GET /receipt': {
        // What WhatsApp has said about ONE message so far — what makes a test
        // send conclusive. `status: null` is "nothing back yet", which for a
        // phone that is off can legitimately take hours. `code` is set when
        // WhatsApp refused it.
        const id = url.searchParams.get('id') ?? '';
        if (!id) {
          json(response, 400, { error: 'id is required' });
          return;
        }
        json(response, 200, { messageId: id, ...receipts.read(id) });
        return;
      }

      case 'POST /send': {
        const body = await readBody(request);
        if (!body.phone || !body.text) {
          json(response, 400, { error: 'phone and text are required' });
          return;
        }
        const result = await (queue = queue.then(
          () => send(body),
          () => send(body),
        ));
        json(response, 200, result);
        return;
      }

      default:
        json(response, 404, { error: 'not found' });
    }
  })().catch((error) => {
    const status = typeof error?.status === 'number' ? error.status : 500;
    if (status >= 500) logger.error({ err: error, route }, 'request failed');
    else logger.warn({ route, status, message: error?.message }, 'request refused');
    json(response, status, {
      error: error instanceof Error ? error.message : 'failed',
      ...(error?.extra ?? {}),
    });
  });
});

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'wa sender listening');
});

// Reconnect on boot if credentials are already on the volume — a redeploy
// must come back sending, not waiting for somebody to press a button. An
// unpaired volume stays quiet until `/link` (see `connect`).
connect().catch((error) => logger.warn({ err: error }, 'initial connect failed'));
