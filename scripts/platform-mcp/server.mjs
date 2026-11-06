#!/usr/bin/env node
/**
 * Platform MCP server — lets an AI assistant (Claude Code, Claude Desktop) work
 * on a stack's admin API with an agent key from «ربط Claude»
 * (`/admin/agent-tokens`), instead of driving a logged-in browser tab.
 *
 * ## Why no dependencies
 *
 * It is one file run with `node`, so there is nothing to install and nothing
 * to audit beyond this file. MCP over stdio is newline-delimited JSON-RPC
 * 2.0; the four methods it needs (`initialize`, `tools/list`, `tools/call`,
 * `ping`) are a few dozen lines, not worth a supply-chain entry.
 *
 * ## Where the key lives
 *
 * The macOS Keychain, under service `platform-mcp` and account = the stack's
 * host — the screen shows the exact `security add-generic-password` line. Not
 * in a config file, not in the MCP config, not in an env var on disk. The
 * `PLATFORM_TOKEN` env var is honoured for CI/Linux, never needed on the Mac.
 *
 * ## What it can do
 *
 * Exactly what the key carries — the API enforces it, this file does not try
 * to. `whoami` lists the key's permissions; anything outside them is a 403.
 *
 * Usage:
 *   node server.mjs --url https://example.com
 *   claude mcp add --scope user platform -- node /path/server.mjs --url https://example.com
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

const run = promisify(execFile);

const KEYCHAIN_SERVICE = 'platform-mcp';
const SERVER_INFO = { name: 'platform', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

// Cloudflare answers a library user-agent with 403 «error code: 1010» before
// the request reaches the origin — it reads exactly like a bad key. A browser
// UA gets through; the suffix keeps these requests findable in logs.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 platform-mcp/1';

// The API allows 60 requests a minute per caller. Writes are spaced so a
// marking batch never trips it; a 429 waits and retries instead of failing.
const WRITE_SPACING_MS = 1100;
const MAX_RETRIES = 3;
const MAX_TEXT = 120_000;

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const BASE_URL = (arg('url') ?? process.env.PLATFORM_URL ?? '').replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(BASE_URL)) {
  process.stderr.write('platform-mcp: pass --url https://<stack-host> (or PLATFORM_URL)\n');
  process.exit(2);
}
const HOST = new URL(BASE_URL).host;

let cachedToken;
async function token() {
  if (cachedToken) return cachedToken;
  if (process.env.PLATFORM_TOKEN) return (cachedToken = process.env.PLATFORM_TOKEN.trim());
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', HOST, '-w']);
    cachedToken = stdout.trim();
  } catch {
    throw new Error(
      `No key for ${HOST} in the Keychain. Make one at ${BASE_URL}/admin/agent-tokens, then run:\n` +
        `security add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${HOST} -w`,
    );
  }
  return cachedToken;
}

// Admin lists accept only these page sizes (`PAGE_SIZES` in contracts); any
// other `perPage` is a 400 «invalid list query». Snap up to the next one.
const PAGE_SIZES = [10, 20, 50, 100];
const pageSize = (n) => PAGE_SIZES.find((size) => size >= Number(n)) ?? 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastWriteAt = 0;

/** One API call. Throws with the API's own words on any non-2xx. */
async function api(method, path, { body, query, binary = false } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new Error('path must start with /api/ — e.g. /api/admin/homework');
  }
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, key === 'perPage' ? String(pageSize(value)) : String(value));
  }

  const isWrite = method !== 'GET';
  for (let attempt = 0; ; attempt += 1) {
    if (isWrite) {
      const wait = lastWriteAt + WRITE_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastWriteAt = Date.now();
    }
    const headers = {
      authorization: `Bearer ${await token()}`,
      'user-agent': USER_AGENT,
      accept: binary ? '*/*' : 'application/json',
    };
    // The CSRF guard wants the header present on writes; a key carries no
    // cookie, so there is nothing for a forged request to ride on anyway.
    if (isWrite) headers['x-csrf-token'] = '1';
    if (body !== undefined) headers['content-type'] = 'application/json';

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // A dropped connection («terminated», «fetch failed») between here and
      // Cloudflare. Reads are retried; a write is not, because it may have
      // landed — the caller re-reads and decides.
      if (!isWrite && attempt < MAX_RETRIES) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw new Error(`${method} ${path} → network error: ${error?.cause?.message ?? error?.message ?? error}`);
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 30_000);
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      const hint =
        response.status === 401
          ? ' (key missing, expired, revoked, or the stack has «ربط Claude» off)'
          : response.status === 403
            ? ' (the key does not carry the permission for this route — see whoami)'
            : '';
      throw new Error(`${method} ${path} → ${response.status}${hint}: ${text.slice(0, 600)}`);
    }
    if (binary) {
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        type: response.headers.get('content-type') ?? 'application/octet-stream',
      };
    }
    if (response.status === 204) return null;
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

/**
 * An image as MCP content, shrunk with macOS `sips` when it is large — a
 * phone photo of a notebook page is 3–5 MB, and the model reads 1600 px fine.
 */
async function imageContent(path, maxPx = 1600) {
  const { bytes, type } = await api('GET', path, { binary: true });
  if (!type.startsWith('image/')) throw new Error(`${path} is ${type}, not an image`);
  if (bytes.length <= 900_000) return { type: 'image', data: bytes.toString('base64'), mimeType: type };

  const dir = await mkdtemp(join(tmpdir(), 'platform-mcp-'));
  try {
    const source = join(dir, 'in');
    const out = join(dir, 'out.jpg');
    await writeFile(source, bytes);
    await run('sips', ['-Z', String(maxPx), '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', source, '--out', out]);
    return { type: 'image', data: (await readFile(out)).toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    // No `sips` (not a Mac): send it as it is rather than not at all.
    return { type: 'image', data: bytes.toString('base64'), mimeType: type };
  } finally {
    // Student work does not stay on disk.
    await rm(dir, { recursive: true, force: true });
  }
}

function text(value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return {
    type: 'text',
    text: body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT)}\n… [truncated ${body.length - MAX_TEXT} chars — narrow the query or page it]` : body,
  };
}

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

const TOOLS = [
  {
    name: 'whoami',
    description: 'The key in use: its name, expiry, the account it acts as, and the exact permissions it carries. Call first.',
    inputSchema: obj({}),
    run: async () => [text(await api('GET', '/api/agent/me'))],
  },
  {
    name: 'api_get',
    description:
      'GET any admin API route the key is allowed, e.g. /api/admin/students?q=…, /api/admin/payments, /api/admin/courses. Returns JSON. List routes take perPage 10/20/50/100 only (put it in `query`; other values are snapped up).',
    inputSchema: obj(
      {
        path: { type: 'string', description: 'Starts with /api/. Query may be inline or in `query`.' },
        query: { type: 'object', description: 'Query-string parameters.', additionalProperties: true },
      },
      ['path'],
    ),
    run: async ({ path, query }) => [text(await api('GET', path, { query }))],
  },
  {
    name: 'api_write',
    description:
      'POST/PUT/PATCH/DELETE an admin API route the key is allowed. Changes real data on the live platform — students are notified by many of these. Confirm intent before bulk writes.',
    inputSchema: obj(
      {
        method: { type: 'string', enum: ['POST', 'PUT', 'PATCH', 'DELETE'] },
        path: { type: 'string', description: 'Starts with /api/.' },
        body: { description: 'JSON body.' },
      },
      ['method', 'path'],
    ),
    run: async ({ method, path, body }) => [text((await api(method, path, { body })) ?? 'OK (no content)')],
  },
  {
    name: 'get_image',
    description: 'Fetch an image route (e.g. /api/admin/homework/images/<id>) and return it so it can be looked at.',
    inputSchema: obj(
      { path: { type: 'string' }, max_px: { type: 'number', description: 'Longest side after shrinking (default 1600).' } },
      ['path'],
    ),
    run: async ({ path, max_px }) => [await imageContent(path, max_px)],
  },
  {
    name: 'homework_pending',
    description: 'Homework submissions waiting for review (oldest first as the API orders them).',
    inputSchema: obj({
      page: { type: 'number' },
      perPage: { type: 'number', description: '10, 20, 50 or 100 (others are snapped up).' },
      courseId: { type: 'string' },
      lessonId: { type: 'string' },
    }),
    run: async ({ page = 1, perPage = 50, courseId, lessonId }) => [
      text(await api('GET', '/api/admin/homework', { query: { filter: 'pending', page, perPage, courseId, lessonId } })),
    ],
  },
  {
    name: 'homework_open',
    description: 'One submission: the prompt, the student, and the photos of the work (as images).',
    inputSchema: obj({ id: { type: 'string' }, images: { type: 'boolean', description: 'Include the photos (default true).' } }, ['id']),
    run: async ({ id, images = true }) => {
      const detail = await api('GET', `/api/admin/homework/${encodeURIComponent(id)}`);
      const content = [text(detail)];
      if (images && Array.isArray(detail?.imageIds)) {
        for (const imageId of detail.imageIds) {
          content.push(await imageContent(`/api/admin/homework/images/${encodeURIComponent(imageId)}`));
        }
      }
      return content;
    },
  },
  {
    name: 'homework_review',
    description:
      'Mark a submission. decision "accepted" (grade 0–100 optional) or "needs_work" (no grade). message 2–1000 chars, Egyptian Arabic, never gendered. Notifies the student.',
    inputSchema: obj(
      {
        id: { type: 'string' },
        decision: { type: 'string', enum: ['accepted', 'needs_work'] },
        grade: { type: ['number', 'null'] },
        message: { type: 'string' },
      },
      ['id', 'decision', 'message'],
    ),
    run: async ({ id, decision, grade = null, message }) => {
      await api('POST', `/api/admin/homework/${encodeURIComponent(id)}/review`, {
        body: { decision, grade: decision === 'accepted' ? grade : null, message },
      });
      return [text(`Reviewed ${id}: ${decision}${grade !== null && decision === 'accepted' ? ` (${grade})` : ''}`)];
    },
  },
  {
    name: 'exam_queue',
    description: 'Exam attempts with essay answers waiting to be marked.',
    inputSchema: obj({}),
    run: async () => [text(await api('GET', '/api/admin/grading-queue'))],
  },
  {
    name: 'exam_attempt',
    description: 'One attempt for marking: every question, the student answer, and which ones are needs_grading.',
    inputSchema: obj({ attemptId: { type: 'string' } }, ['attemptId']),
    run: async ({ attemptId }) => [text(await api('GET', `/api/admin/attempts/${encodeURIComponent(attemptId)}/grading`))],
  },
  {
    name: 'exam_grade_answer',
    description:
      'Mark one essay answer. Marking the last pending answer finalises the attempt and notifies the student. feedbackHtml: short, Egyptian Arabic, with the correct answer when deducting.',
    inputSchema: obj(
      {
        attemptId: { type: 'string' },
        attemptQuestionId: { type: 'string' },
        mark: { type: 'number' },
        feedbackHtml: { type: 'string' },
      },
      ['attemptId', 'attemptQuestionId', 'mark'],
    ),
    run: async ({ attemptId, attemptQuestionId, mark, feedbackHtml }) => [
      text(
        (await api(
          'PATCH',
          `/api/admin/attempts/${encodeURIComponent(attemptId)}/questions/${encodeURIComponent(attemptQuestionId)}/grade`,
          { body: { mark, ...(feedbackHtml ? { feedbackHtml } : {}) } },
        )) ?? 'OK',
      ),
    ],
  },
];

const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(request) {
  const { id, method, params } = request;
  const isNotification = id === undefined || id === null;
  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions:
            `Admin API of ${HOST}, limited to this key's permissions (call whoami). ` +
            'Writes change the live platform and usually notify a student. Student-facing text is Egyptian Arabic and never gendered.',
        };
        break;
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
        break;
      case 'tools/call': {
        const tool = byName.get(params?.name);
        if (!tool) throw Object.assign(new Error(`unknown tool ${params?.name}`), { code: -32602 });
        try {
          result = { content: await tool.run(params?.arguments ?? {}) };
        } catch (error) {
          // A failed call is a tool RESULT the model can read and react to,
          // not a protocol error.
          result = { content: [text(String(error?.message ?? error))], isError: true };
        }
        break;
      }
      default:
        if (isNotification) return; // notifications/initialized and friends
        throw Object.assign(new Error(`method not found: ${method}`), { code: -32601 });
    }
    if (!isNotification) send({ jsonrpc: '2.0', id, result });
  } catch (error) {
    if (!isNotification) {
      send({ jsonrpc: '2.0', id, error: { code: error.code ?? -32603, message: String(error.message ?? error) } });
    }
  }
}

const inFlight = new Set();
const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
    return;
  }
  const pending = handle(message).finally(() => inFlight.delete(pending));
  inFlight.add(pending);
});
// The client closed stdin: answer what is already in flight, then leave.
lines.on('close', () => void Promise.allSettled([...inFlight]).then(() => process.exit(0)));
