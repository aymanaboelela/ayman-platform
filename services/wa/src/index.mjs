import { createServer } from 'node:http';
import { rm } from 'node:fs/promises';
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
          rm(AUTH_DIR, { recursive: true, force: true }).catch(() => undefined);
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

async function send({ phone: to, text, imageUrl }) {
  if (state !== 'connected' || !sock) throw new Error('device is not connected');

  const jid = jidFor(to);

  // Ask WhatsApp whether the number has an account before composing anything
  // at it. A send to a non-existent number is not merely wasted — repeated
  // ones are one of the signals that get a number flagged.
  const [check] = await sock.onWhatsApp(jid);
  if (!check?.exists) return { messageId: null, onWhatsApp: false };

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

  const sent = await sock.sendMessage(jid, payload);
  return { messageId: sent?.key?.id ?? null, onWhatsApp: true };
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
        if (state !== 'connected') await connect();
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
        await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => undefined);
        json(response, 200, { ok: true });
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
