'use server';

import { revalidatePath } from 'next/cache';
import { copy } from '@ayman/contracts/copy';
import {
  EditMessageSchema,
  ReplySchema,
  SetReactionSchema,
  SetStatusSchema,
  type MessageAttachmentInput,
} from '@ayman/contracts/assistant/conversation';
import { adminSendVoid } from '@/lib/admin-api';

export type InboxActionResult = { ok: true } | { ok: false; message: string };

/**
 * ⚠️ `adminSendVoid`, never `adminSend`.
 *
 * Both routes answer `204`, and `adminSend` ends with
 * `schema.parse(await response.json())` — which throws on an empty body AFTER
 * the API has already written the reply. That is exactly how this shipped:
 * the message was saved and the student notified, and then the instructor was
 * told it had failed. A `z.unknown()` schema does not help, because the throw
 * happens in `.json()` before any schema is consulted.
 */

/**
 * `revalidatePath`, not `updateTag`.
 *
 * The settings actions use `updateTag` because they feed `'use cache'`
 * entries that outlive the request. The inbox does not: every read goes
 * through `adminGet`, which is `cache: 'no-store'` precisely so an editor can
 * never see a stale row. What still needs busting is the ROUTER cache — the
 * client-side snapshot of the RSC payload, which would otherwise re-render the
 * thread without the message just sent.
 */
export async function replyAction(
  id: string,
  message: string,
  /**
   * Already UPLOADED — this is the receipt, not the bytes.
   *
   * The file went browser→API through `uploadConversationAttachment` before
   * this action ran, and deliberately so: a Server Action buffers its whole
   * payload in the Next server's memory and is capped at 1 MB
   * (`serverActions.bodySizeLimit`, never raised here), so a 20 MB deck posted
   * through this function would vanish with no error anywhere. What crosses
   * here is three short strings.
   */
  attachment?: MessageAttachmentInput | null,
): Promise<InboxActionResult> {
  try {
    const body = ReplySchema.parse({ message, attachment: attachment ?? null });
    await adminSendVoid('POST', `/api/admin/conversations/${id}/reply`, body);
    revalidatePath('/admin/inbox');
    revalidatePath(`/admin/inbox/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setStatusAction(
  id: string,
  status: 'open' | 'closed',
): Promise<InboxActionResult> {
  try {
    const body = SetStatusSchema.parse({ status });
    await adminSendVoid('PATCH', `/api/admin/conversations/${id}/status`, body);
    revalidatePath('/admin/inbox');
    revalidatePath(`/admin/inbox/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * «ردّ بإيموجي» — set or clear the instructor's reaction on one message.
 *
 * ## No `revalidatePath`, and that is the difference from every action above
 *
 * A reply changes what the thread SAYS, so the router cache has to be dropped
 * or the instructor re-renders without the message he just sent. A reaction
 * changes one glyph the bubble is ALREADY showing optimistically, and busting
 * the path here would throw away the whole rendered thread — scroll position
 * included — to redraw an emoji that is on screen. The caller does
 * `router.refresh()` itself, which reconciles without the cache eviction.
 *
 * Parsed through the shared schema before it leaves, so a caller cannot post
 * an arbitrary string even though the API validates it again. The API is the
 * gate; this is the second lock on the same door.
 */
export async function setReactionAction(
  conversationId: string,
  messageId: string,
  reaction: string | null,
): Promise<InboxActionResult> {
  try {
    const body = SetReactionSchema.parse({ reaction });
    await adminSendVoid(
      'PUT',
      `/api/admin/conversations/${conversationId}/messages/${messageId}/reaction`,
      body,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * «أعدل عليها» — rewriting the words of a message HE sent.
 *
 * The API enforces `author: 'admin'` inside its WHERE, so a student's message
 * is a 404 rather than a 403 and this action never has to know the difference.
 *
 * `revalidatePath` on the thread and NOT on the inbox list: an edit does not
 * bump `lastMessageAt` or reopen the conversation (see
 * `AssistantService.editMessage`), so the list is unchanged and re-rendering it
 * would be work with no result.
 */
export async function editMessageAction(
  conversationId: string,
  messageId: string,
  message: string,
): Promise<InboxActionResult> {
  try {
    const body = EditMessageSchema.parse({ message });
    await adminSendVoid(
      'PATCH',
      `/api/admin/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      body,
    );
    revalidatePath(`/admin/inbox/${conversationId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: copy.assistant.inbox.messageActionFailed };
  }
}

/** «أمسحها». The list IS revalidated here, unlike the edit: removing the last
 *  message changes the preview the inbox row shows. */
export async function deleteMessageAction(
  conversationId: string,
  messageId: string,
): Promise<InboxActionResult> {
  try {
    await adminSendVoid(
      'DELETE',
      `/api/admin/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    );
    revalidatePath(`/admin/inbox/${conversationId}`);
    revalidatePath('/admin/inbox');
    return { ok: true };
  } catch {
    return { ok: false, message: copy.assistant.inbox.messageActionFailed };
  }
}
