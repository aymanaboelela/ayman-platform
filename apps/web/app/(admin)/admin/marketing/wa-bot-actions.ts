'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import {
  BotAnswerRowSchema,
  BotPreviewSchema,
  BotSettingsReadSchema,
  LeadRowSchema,
  WaChatDetailSchema,
  type BotAnswerCreate,
  type BotAnswerPut,
  type BotSettings,
  type LeadPatch,
  type WaChatPatch,
} from '@ayman/contracts/wa-bot/schemas';
import { AdminApiError, adminSend, adminSendVoid } from '@/lib/admin-api';

/**
 * Every write behind «الرد الآلي», «المهتمين» and the WhatsApp inbox.
 *
 * Its own file rather than more exports on `actions.ts` beside it: that module
 * is imported by the campaign screens' client components, and a new export on
 * a client-imported module is a new module id for tabs left open across a
 * deploy (pitfalls: Turbopack). Same `ActionResult` shape, for the reason that
 * file's header gives — `AdminApiError` must not be imported by a client.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function attempt<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/**
 * The API's own Arabic sentence when it sent one («الرسالة ماطلعتش من
 * الجهاز»), never the «PUT /api/… failed with 503: {…}» line the error
 * carries for the log.
 */
function messageOf(error: unknown): string {
  if (!(error instanceof AdminApiError)) return bot.admin.error;
  const payload = error.payload as { message?: unknown } | null;
  const message = payload && typeof payload.message === 'string' ? payload.message : null;
  return message && /[\u0600-\u06FF]/u.test(message) ? message : bot.admin.error;
}

const BOT_PATH = '/admin/marketing/bot';
const LEADS_PATH = '/admin/marketing/leads';
const INBOX_PATH = '/admin/inbox/whatsapp';

export async function saveBotSettingsAction(settings: BotSettings) {
  return attempt(async () => {
    const row = await adminSend('PUT', '/api/admin/wa-bot/settings', settings, BotSettingsReadSchema);
    revalidatePath(BOT_PATH);
    return row;
  });
}

export async function saveBotAnswerAction(key: string, input: BotAnswerPut) {
  return attempt(async () => {
    const row = await adminSend(
      'PUT',
      `/api/admin/wa-bot/answers/${encodeURIComponent(key)}`,
      input,
      BotAnswerRowSchema,
    );
    revalidatePath(BOT_PATH);
    return row;
  });
}

export async function createBotAnswerAction(input: BotAnswerCreate) {
  return attempt(async () => {
    const row = await adminSend('POST', '/api/admin/wa-bot/answers', input, BotAnswerRowSchema);
    revalidatePath(BOT_PATH);
    return row;
  });
}

export async function resetBotAnswerAction(key: string) {
  return attempt(async () => {
    await adminSendVoid('DELETE', `/api/admin/wa-bot/answers/${encodeURIComponent(key)}`);
    revalidatePath(BOT_PATH);
    return true;
  });
}

export async function previewBotAction(text: string, phone: string | null) {
  return attempt(() =>
    adminSend('POST', '/api/admin/wa-bot/preview', { text, ...(phone ? { phone } : {}) }, BotPreviewSchema),
  );
}

export async function patchLeadAction(id: string, patch: LeadPatch) {
  return attempt(async () => {
    const row = await adminSend('PATCH', `/api/admin/wa-bot/leads/${encodeURIComponent(id)}`, patch, LeadRowSchema);
    revalidatePath(LEADS_PATH);
    return row;
  });
}

export async function replyWaChatAction(id: string, text: string) {
  return attempt(async () => {
    const row = await adminSend(
      'POST',
      `/api/admin/wa-bot/chats/${encodeURIComponent(id)}/reply`,
      { text },
      WaChatDetailSchema,
    );
    revalidatePath(`${INBOX_PATH}/${encodeURIComponent(id)}`);
    revalidatePath(INBOX_PATH);
    return row;
  });
}

export async function patchWaChatAction(id: string, patch: WaChatPatch) {
  return attempt(async () => {
    const row = await adminSend(
      'PATCH',
      `/api/admin/wa-bot/chats/${encodeURIComponent(id)}`,
      patch,
      WaChatDetailSchema,
    );
    revalidatePath(`${INBOX_PATH}/${encodeURIComponent(id)}`);
    revalidatePath(INBOX_PATH);
    return row;
  });
}
