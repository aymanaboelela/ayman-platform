import { createServer } from 'node:http';
import { clearAuthDir } from './auth-store.mjs';
import { SentStore } from './sent-store.mjs';
import { timingSafeEqual } from 'node:crypto';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { ConnectWatchdog } from './connect-watchdog.mjs';
import { ReceiptStore, STATUS, statusFromReceipt } from './receipt-store.mjs';
import { waitForLinkProgress } from './link-wait.mjs';

/**
 * One WhatsApp device, one message at a time.
 *
 * Everything about WHEN to send lives in the API. This process knows how to
 * hold a session, how to answer whether it is holding one, and how to put one
 * message on the wire. That division is the whole reason it is a separate
 * container — see README.md.
 */

const PORT = Number(process.env.WA_PORT ?? 3400);
const TOKEN = process.env.WA_TOKEN ?? '';
const AUTH_DIR = process.env.WA_AUTH_DIR ?? './.wa-auth';
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

const logger = pino({ level: process.env.WA_LOG_LEVEL ?? 'warn' });

/** `disconnected` | `linking` | `connected`. Mirrors the contract's enum. */
let state = 'disconnected';
/** A `data:image/png;base64,…` QR while pairing, else null. */
let qr = null;
let phone = null;
let detail = null;
let sock = null;
/** Set while `connect()` is in flight, so two callers do not race a socket. */
let connecting = null;

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
 * belongs to the current attempt.
 */
let generation = 0;

/**
 * How long a single handshake attempt may go without ANY progress — not
 * even a QR refresh — before it counts as wedged rather than merely slow.
 * See `connect-watchdog.mjs` for why this is safe against a legitimately
 * long wait for a human to scan a code.
 *
 * 30s is generous for what Baileys normally needs to reach `open` or a
 * first `qr` (single digits of seconds against WhatsApp's servers), so it
 * never punishes a real handshake, while still being short enough that a
 * process wedged mid-handshake self-heals within the same minute rather
 * than rotting until someone notices.
 */
const CONNECT_TIMEOUT_MS = Number(process.env.WA_CONNECT_TIMEOUT_MS ?? 30_000);
/** How often we check the watchdog while an attempt is in flight. */
const WATCHDOG_POLL_MS = 5000;
/**
 * Extra margin past `CONNECT_TIMEOUT_MS` before `/health` itself calls a
 * stuck attempt unhealthy. This is a backstop for `forceReset` failing to
 * run at all (it polls every `WATCHDOG_POLL_MS`, so it should long since
 * have fired) — not a shorter, competing timeout. It must never be tight
 * enough to flag an ordinary handshake or the 5s post-close reconnect beat.
 */
const HEALTH_GRACE_MS = 60_000;

/**
 * How long `POST /link` waits for the handshake to produce something worth
 * answering with — a QR, or a finished connection.
 *
 * `connect()` resolves as soon as the socket OBJECT exists, which is long
 * before WhatsApp has issued a code: Baileys delivers that asynchronously on
 * `connection.update`. Answering at that moment hands the admin screen the
 * pre-click state — `disconnected`, `qr: null` — so the button reads as
 * broken and the code only appears whenever the next poll happens to land.
 *
 * Ten seconds is comfortably past the single digits a real handshake takes,
 * and the API side was given a matching `LINK_TIMEOUT_MS` (20s) for this one
 * route — it used to call `/link` on the 4s status budget, which would have
 * aborted this wait mid-handshake and reported a failure for what is simply
 * a code that had not arrived yet. It is a ceiling, not a delay: the loop
 * returns the instant there is a code, so the common path is ~1-3s.
 */
const LINK_QR_WAIT_MS = Number(process.env.WA_LINK_QR_WAIT_MS ?? 10_000);
/** Granularity of that wait. Short enough to feel immediate. */
const LINK_QR_POLL_MS = 250;

const connectWatchdog = new ConnectWatchdog(CONNECT_TIMEOUT_MS);
let watchdogTimer = null;

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

/**
 * Declares the in-flight attempt dead and puts the module back in a state
 * where the NEXT `/link` genuinely starts a fresh attempt, instead of
 * `connecting` staying non-null forever and every future call short-
 * circuiting on `if (connecting) return connecting` — the 2026-08-27 bug.
 */
function forceReset(reason) {
  disarmWatchdog();
  // Any late event from the socket we are about to kill belongs to an
  // attempt nothing should trust any more.
  generation += 1;
  const stale = sock;
  sock = null;
  connecting = null;
  state = 'disconnected';
  qr = null;
  detail = reason;
  logger.warn({ reason }, 'wa connect watchdog: resetting a wedged attempt');
  try {
    // Best-effort: the socket may not even exist yet (e.g. stuck fetching
    // the Baileys version), and Baileys may already consider it dead.
    stale?.end(new Error(reason));
  } catch (error) {
    logger.warn({ err: error }, 'wa connect watchdog: closing the stale socket failed');
  }
  // Same beat as the transient branch of the close handler below: don't
  // retry in a tight loop against whatever made this attempt hang.
  setTimeout(() => {
    connect().catch((error) => logger.error({ err: error }, 'reconnect after timeout failed'));
  }, 5000);
}

/**
 * What has been sent recently, for answering retry receipts — see
 * `sent-store.mjs`. Deliberately OUTSIDE `connect()`: a recipient's phone can
 * ask for a message again after the socket that sent it has dropped and
 * reconnected, and forgetting on every reconnect would fail exactly the
 * retries most likely to be asked for.
 */
const sent = new SentStore();

/**
 * The highest status WhatsApp has reported for each message we sent.
 *
 * Outside `connect()` for the same reason `sent` is: receipts for a message
 * keep arriving across a reconnect — a recipient whose phone was off when we
 * sent acks hours later, through whatever socket is current by then — and a
 * map that forgot on every reconnect would relay those as if they were new,
 * or lose the ordering that stops a late receipt walking a row backwards.
 *
 * Not durable, and deliberately so: the API is the record. A receipt that
 * arrives after a restart is simply relayed again, and the API's
 * highest-status-wins makes that a no-op.
 */
const receipts = new ReceiptStore();

/**
 * A single in-flight send at a time.
 *
 * The API already serialises campaigns, but nothing stops an operator from
 * pressing something twice, and two concurrent `sendMessage` calls on one
 * Baileys socket is a class of bug nobody wants to debug. Every send queues
 * behind the previous one.
 */
let queue = Promise.resolve();

function digitsOf(value) {
  return String(value).replace(/\D/gu, '');
}

function jidFor(value) {
  return `${digitsOf(value)}@s.whatsapp.net`;
}

/**
 * Opens (or re-opens) the socket.
 *
 * `useMultiFileAuthState` reads the volume: on a redeploy the credentials are
 * already there and the phone is never asked to scan anything again. That is
 * the single most important property of this file.
 */
async function connect() {
  if (connecting) return connecting;

  const myGeneration = ++generation;
  armWatchdog();

  connecting = (async () => {
    // Never read the auth directory while it is being emptied — see `clearing`.
    await clearing.catch(() => undefined);
    const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    // A watchdog reset (or a fresh `/unlink`) may have superseded this
    // attempt while the two awaits above were in flight. Building a socket
    // now would race whatever the newer attempt is doing.
    if (myGeneration !== generation) return;

    sock = makeWASocket({
      version,
      auth,
      logger,
      // Never true: this process has no terminal anybody is reading, and the
      // QR is served over HTTP to the admin screen instead.
      printQRInTerminal: false,
      // How the pairing shows up in the phone's «الأجهزة المرتبطة» list. A
      // recognisable name matters — an entry nobody can identify is one that
      // eventually gets revoked by a cautious owner.
      browser: Browsers.ubuntu('Ayman Platform'),
      // Presence is not broadcast. A sender that appears permanently online
      // is a bot tell, and there is nobody on this end to be online.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      // ⚠️ WITHOUT THIS, A MESSAGE THAT FAILS TO DECRYPT NEVER ARRIVES.
      //
      // A recipient that cannot decrypt asks the sender to send it again, and
      // this hook is how Baileys answers. With no hook the request goes
      // unanswered and the message sits on their phone as pending forever —
      // reported as «الرسالة بتتحمّل على واتساب الشخص، مش بتظهر». It bites
      // hardest on the FIRST message to a number, which for a campaign is the
      // only kind there is. See `sent-store.mjs`.
      getMessage: async (key) => sent.get(key),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      // A stale event from a socket `forceReset` already killed on behalf
      // of a newer attempt — ignore it rather than clobber current state.
      if (myGeneration !== generation) return;

      // Any update at all — a QR reissue included — is proof this attempt
      // is still alive, so push the wedged-attempt deadline back.
      connectWatchdog.touch();

      if (update.qr) {
        state = 'linking';
        QRCode.toDataURL(update.qr, { margin: 1, width: 320 })
          .then((url) => {
            qr = url;
          })
          .catch(() => {
            qr = null;
          });
      }

      if (update.connection === 'open') {
        // Reached a terminal, successful state — nothing left to watch for
        // until the NEXT connect() attempt (e.g. after a later drop).
        disarmWatchdog();
        state = 'connected';
        qr = null;
        detail = null;
        phone = sock?.user?.id ? `+${digitsOf(sock.user.id.split(':')[0])}` : null;
      }

      if (update.connection === 'close') {
        // Also terminal (if a different way) — the reconnect this schedules
        // below goes through `connect()` again, which re-arms its own.
        disarmWatchdog();
        const status = update.lastDisconnect?.error?.output?.statusCode;
        state = 'disconnected';
        qr = null;
        detail = status ? `closed: ${status}` : 'closed';

        // `loggedOut` means the phone revoked this device. Reconnecting would
        // loop forever against credentials WhatsApp has already invalidated,
        // so the only correct move is to forget them and wait for a human to
        // pair again.
        if (status === DisconnectReason.loggedOut) {
          phone = null;
          connecting = null;
          sock = null;
          // ⚠️ IF THIS FAILS, THE DEVICE PAGE CAN NEVER RECOVER — say so.
          //
          // Credentials WhatsApp has revoked are replayed by every subsequent
          // `connect()`, which closes 401 again before a QR can be issued, so
          // a clear that quietly did nothing left «اربط رقم جديد» and «امسح
          // البيانات» both permanently powerless. It did exactly that for as
          // long as this called `rm` on the directory itself — see
          // `auth-store.mjs`. The failure is now carried into `detail`, which
          // is the one channel the admin screen actually shows.
          clearing = clearAuthDir(AUTH_DIR);
          clearing
            .then(({ removed }) =>
              logger.warn({ removed }, 'wa: device revoked by the phone — pairing credentials cleared'),
            )
            .catch((error) => {
              detail = `logged out, and clearing the credentials failed: ${error.code ?? error.message}`;
              logger.error({ err: error, dir: AUTH_DIR }, 'wa: could not clear revoked credentials');
            });
          return;
        }

        connecting = null;
        sock = null;
        // Everything else is transient (network, 515 restart-required,
        // conflict). Reconnect after a beat rather than immediately, so a
        // server-side rejection is not answered with a tight loop.
        setTimeout(() => {
          connect().catch((error) => logger.error({ err: error }, 'reconnect failed'));
        }, 5000);
      }
    });

    if (INBOUND_URL) sock.ev.on('messages.upsert', onIncoming);

    // ⚠️ THE SECOND TICK. Registered per socket, because `connect()` builds a
    // new one on every reconnect and a listener bound to a dead socket hears
    // nothing — which is precisely how this could have been "added" and still
    // report nothing after the first drop.
    //
    // Baileys has always parsed these; nothing was subscribed to them. See
    // `receipt-store.mjs` for why they are deduplicated before being relayed
    // rather than forwarded one for one.
    if (RECEIPT_URL) {
      sock.ev.on('messages.update', onStatusUpdates);
      sock.ev.on('message-receipt.update', onReceiptUpdates);
    }
  })();

  try {
    await connecting;
  } catch (error) {
    // Only clean up if nothing superseded this attempt in the meantime
    // (e.g. the watchdog already reset it while `useMultiFileAuthState` or
    // `fetchLatestBaileysVersion` was hanging) — otherwise this would wipe
    // out state that already belongs to a newer attempt.
    if (myGeneration === generation) {
      disarmWatchdog();
      connecting = null;
    }
    throw error;
  }
  return undefined;
}

/**
 * Forwards what people reply, so «قف» can actually stop a campaign.
 *
 * Only inbound personal messages — never groups, never our own echoes. The
 * API decides what counts as an opt-out; this just relays the text, and a
 * failure to relay is logged and dropped rather than retried, because the
 * next message will carry the same intent and a retry storm against the API
 * is worse than a missed one.
 */
async function onIncoming({ messages, type }) {
  if (type !== 'notify') return;

  for (const message of messages ?? []) {
    const jid = message.key?.remoteJid ?? '';
    if (message.key?.fromMe) continue;
    if (!jid.endsWith('@s.whatsapp.net')) continue;

    const text =
      message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? '';
    if (!text) continue;

    try {
      await fetch(INBOUND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-wa-token': TOKEN },
        body: JSON.stringify({ phone: `+${digitsOf(jid.split('@')[0])}`, text: text.slice(0, 300) }),
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
 * ## Why this is the most important listener in the file
 *
 * Without it the only success signal this service produces is
 * `sendMessage()` resolving — which means WhatsApp's servers took custody of
 * the stanza and nothing more. ONE GREY TICK. For as long as that was the
 * only signal, the API wrote `status: 'sent'` for messages that were accepted
 * by WhatsApp and delivered to nobody, and the campaign screen reported those
 * runs as «٧٤ من ٧٤ · اتبعت · ٠ فشل» — indistinguishable from a perfect one.
 * The failure was eventually found by a human looking at his own phone.
 *
 * ## Best effort, and that is deliberate
 *
 * A receipt that fails to relay is logged and dropped, exactly like the
 * inbound relay above: the next receipt for the same message carries the same
 * information, the API's own merge is highest-status-wins so a repeat is
 * harmless, and a retry storm against the API is worse than a missed tick.
 *
 * @param {number} status a `STATUS` value
 */
async function relayReceipt(id, status) {
  const news = receipts.observe(id, status);
  if (news === null) return;

  try {
    await fetch(RECEIPT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wa-token': TOKEN },
      body: JSON.stringify({ messageId: id, status: news }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    logger.warn({ err: error, messageId: id, status: news }, 'receipt relay failed');
  }
}

/** `messages.update` — carries a numeric status, including WhatsApp's refusals. */
async function onStatusUpdates(updates) {
  for (const entry of updates ?? []) {
    // Only our own messages have a delivery status worth reporting; an update
    // on an inbound message is somebody else's read receipt, not ours.
    if (entry?.key?.fromMe === false) continue;
    await relayReceipt(entry?.key?.id, entry?.update?.status);
  }
}

/**
 * `message-receipt.update` — timestamps rather than a status, and the event
 * that actually fires for a 1:1 recipient's own devices.
 */
async function onReceiptUpdates(updates) {
  for (const entry of updates ?? []) {
    if (entry?.key?.fromMe === false) continue;
    const status = statusFromReceipt(entry?.receipt);
    if (status === null) continue;
    await relayReceipt(entry?.key?.id, status);
  }
}

async function send({ phone: to, text, imageUrl }) {
  if (state !== 'connected' || !sock) throw new Error('device is not connected');

  const jid = jidFor(to);

  // Ask WhatsApp whether the number has an account before composing anything
  // at it. A send to a non-existent number is not merely wasted — repeated
  // ones are one of the signals that get a number flagged.
  //
  // `?? []` is not defensive dressing: this query returns an EMPTY list when
  // WhatsApp answers nothing at all — a momentary server-side hiccup, not a
  // verdict about the number — and destructuring that bare used to throw a
  // TypeError out of `/send`, which the API reports to the operator as a
  // device fault.
  const [check] = (await sock.onWhatsApp(jid)) ?? [];
  if (!check?.exists) return { messageId: null, onWhatsApp: false };

  // ⚠️ KEEP THE WHOLE ANSWER. `check` is `{ jid, exists, lid }`, and the
  // `lid` — WhatsApp's Linked Identity for this account — was being thrown
  // away here for as long as this function existed.
  //
  // That matters because WhatsApp has been migrating user identity from the
  // phone number to the LID, and the 6.x line of Baileys has no LID↔PN
  // mapping at all: it addresses and encrypts to the phone-number JID only.
  // A stanza addressed that way to a migrated recipient is ACCEPTED by
  // WhatsApp's servers — one grey tick — and never routed to their devices.
  // That is the leading explanation for «الرسايل بتتبعت وماحدش بيستلمها»، and
  // it is untestable while the one field that would prove it is discarded.
  //
  // It is reported, not acted on: sending to a `@lid` from a client with no
  // LID session machinery is not a fix, it is a different guess. What this
  // does is let `POST /send` answer the question in one call.

  // Two small human tells, in the right order: read the chat, then appear to
  // type for a moment proportional to the message. Cheap, and the alternative
  // is a message that arrives with no preceding activity at all.
  await sock.presenceSubscribe(jid).catch(() => undefined);
  await sock.sendPresenceUpdate('composing', jid).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, Math.min(6000, 800 + text.length * 25)));
  await sock.sendPresenceUpdate('paused', jid).catch(() => undefined);

  const payload = imageUrl
    ? { image: { url: imageUrl }, caption: text }
    : { text };

  const message = await sock.sendMessage(jid, payload);
  // Recorded before returning, not after: the caller logs the send and moves
  // on, and a retry receipt can land while it is still doing that.
  sent.remember(message?.key?.id, message?.message);
  return {
    messageId: message?.key?.id ?? null,
    onWhatsApp: true,
    /** What we addressed. */
    jid,
    /** What WhatsApp says the canonical address is — normally the same. */
    serverJid: check.jid ?? null,
    /** Non-null means this account has migrated to LID addressing. */
    lid: check.lid ?? null,
  };
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
    if (size > 64 * 1024) throw new Error('payload too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /health') {
    // Deliberately NOT "is a device linked" — `disconnected` is a perfectly
    // healthy container (nobody has paired a phone yet, or a normal brief
    // reconnect is in progress) and always has been. The one thing this
    // adds: if a connect attempt has been wedged for far longer than the
    // in-process watchdog (`forceReset`, above) should ever have allowed —
    // i.e. that recovery itself failed to run — say so, so Dokploy/Docker
    // can actually restart a container that would otherwise rot forever
    // exactly like the 2026-08-27 incident. `HEALTH_GRACE_MS` on top of
    // `CONNECT_TIMEOUT_MS` means this only trips well after our own retry
    // should have already fired; it never flags an ordinary handshake or
    // the 5s post-close reconnect beat.
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
        json(response, 200, { state, phone, qr, detail });
        return;

      case 'POST /link':
        // Idempotent: linking an already-connected device is a no-op rather
        // than a reset, so a double click cannot drop a working session.
        if (state !== 'connected') {
          await connect();
          // …and then wait for the code itself. `connect()` only guarantees a
          // socket; see `LINK_QR_WAIT_MS` for why answering there made the
          // button look dead. Reading through a closure keeps `link-wait.mjs`
          // free of this module's mutable state — which is what makes it
          // testable without a live socket.
          const why = await waitForLinkProgress(() => ({ qr, state }), {
            timeoutMs: LINK_QR_WAIT_MS,
            pollMs: LINK_QR_POLL_MS,
          });
          if (why === 'timeout') {
            logger.warn({ state, detail }, 'wa /link: no QR within the wait — answering with current state');
          }
        }
        json(response, 200, { state, phone, qr, detail });
        return;

      case 'POST /unlink': {
        // Same reasoning as `forceReset`: bump the generation so a
        // still-in-flight `connect()` attempt (e.g. one currently wedged)
        // cannot write its state back over this deliberate reset.
        disarmWatchdog();
        generation += 1;
        await sock?.logout().catch(() => undefined);
        sock = null;
        connecting = null;
        state = 'disconnected';
        phone = null;
        qr = null;
        detail = null;
        // Not swallowed: this route exists BECAUSE the operator is trying to
        // recover a stuck pairing, and answering `ok` to a clear that cleared
        // nothing is how the stuck state survived being told to go away.
        try {
          clearing = clearAuthDir(AUTH_DIR);
          const { removed } = await clearing;
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
        // What WhatsApp has said about ONE message so far — the endpoint that
        // makes a test send conclusive instead of a thing somebody has to
        // squint at on a phone. `null` means nothing has come back yet, which
        // for a recipient who is online resolves within seconds and for one
        // whose phone is off can legitimately take hours.
        const id = url.searchParams.get('id') ?? '';
        if (!id) {
          json(response, 400, { error: 'id is required' });
          return;
        }
        json(response, 200, { messageId: id, status: receipts.get(id) ?? null });
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
    logger.error({ err: error, route }, 'request failed');
    json(response, 500, { error: error instanceof Error ? error.message : 'failed' });
  });
});

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'wa sender listening');
});

// Reconnect on boot if credentials are already on the volume — a redeploy
// must come back sending, not waiting for somebody to press a button.
connect().catch((error) => logger.warn({ err: error }, 'initial connect failed'));
