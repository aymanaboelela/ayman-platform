import {
  ConversationThreadSchema,
  TRANSCRIPT_TURNS_MAX,
  TRANSCRIPT_TURN_WIRE_MAX,
  type AssistantTranscriptTurn,
  type ConversationThread,
} from '@ayman/contracts/assistant/conversation';
import { apiPost } from '@/lib/api';

/**
 * Opening the thread أيمن answers in — the ONE place the panel does it.
 *
 * ## Why this is its own module and not a function in the form
 *
 * It used to be four lines inside `assistant-escalate.tsx`, which was fine
 * while a tap on «ابعت لأيمن» was the only way a thread could be opened. It is
 * not any more: المساعد hands over BY ITSELF when it is out of its depth, and
 * that path never renders the form at all — «الطالب مالوش دعوة إن فيه شاشة
 * تانية». Two callers, one request, and the request carries a transcript that
 * has to be assembled identically either way.
 *
 * ## Zod is here, and that is the point
 *
 * `ConversationThreadSchema` is the reason this file exists as a separate
 * module rather than living in the widget: `assistant-widget.tsx` is a client
 * reference on effectively every route, and a schema imported there is Zod on
 * the critical path of the landing page and of a running quiz. The widget
 * reaches this through `await import('./assistant-handoff')` at the moment of
 * a handoff, exactly as it reaches the form and the thread — see the header of
 * `assistant-widget.tsx`, which spends thirty lines on why.
 */

/** A guest's typed identity. Omitted entirely for a signed-in student. */
export interface HandoffGuest {
  name: string;
  phone: string;
}

export interface HandoffInput {
  entryPath: string[];
  message: string;
  /**
   * The chat that led here, oldest first — sent as it stands, and cut down to
   * the wire limits by `carry()` below.
   */
  transcript?: readonly AssistantTranscriptTurn[];
  guest?: HandoffGuest | null;
}

/**
 * The turns, cut to what the request is actually allowed to carry.
 *
 * ## ⚠️ IT USED TO SAY «THE SERVER TRIMS IT», AND THE SERVER DOES NOT
 *
 * `serializeAssistantTranscript` really does drop the oldest turns and clip
 * the long ones — but it runs INSIDE the service, and `OpenConversationSchema`
 * validates the body before the service is ever called:
 * `.max(TRANSCRIPT_TURNS_MAX)` on the array and `.max(TRANSCRIPT_TURN_WIRE_MAX)`
 * on each `text`. So a chat past either limit was a 400 and المساعد's
 * «هبعت الرسالة للمهندس أيمن» quietly became «مقدرناش نوصّل السؤال» — on
 * precisely the long, confused conversations that had earned a person.
 *
 * Both entry points cut here rather than in the widget, so there is ONE place
 * that knows the limits and it imports them from the schema that enforces
 * them. Newest turns are kept: the handoff happened at the END of the
 * conversation, which is the half أيمن is being asked about.
 *
 * Trim-then-clip-then-drop, in that order, because `.min(1)` is on the
 * TRIMMED string — a turn of only whitespace is a 400 by itself, and clipping
 * cannot create one but the widget's ref could always have carried one.
 */
function carry(
  turns: readonly AssistantTranscriptTurn[] | undefined,
): AssistantTranscriptTurn[] {
  if (!turns || turns.length === 0) return [];
  return turns
    .slice(-TRANSCRIPT_TURNS_MAX)
    .map((turn) => ({
      role: turn.role,
      text: turn.text.trim().slice(0, TRANSCRIPT_TURN_WIRE_MAX),
    }))
    .filter((turn) => turn.text.length > 0);
}

export async function openAssistantConversation(
  input: HandoffInput,
): Promise<ConversationThread> {
  const transcript = carry(input.transcript);
  return apiPost('/api/assistant/conversations', ConversationThreadSchema, {
    entryPath: input.entryPath,
    message: input.message,
    /*
     * Omitted rather than sent empty. `OpenConversationSchema` is `.strict()`
     * and its optional members have minimum lengths, so an empty array and an
     * empty name are both a 400 for no reason — the same discipline the form
     * already followed for a signed-in student's name and phone.
     */
    ...(transcript.length > 0 ? { transcript } : {}),
    ...(input.guest ? { name: input.guest.name, phone: input.guest.phone } : {}),
  });
}

/**
 * A SECOND handoff, into the thread the first one opened.
 *
 * Not a new conversation, deliberately. المساعد can run out of answer twice in
 * one afternoon, and every one of those would otherwise be its own row in
 * صندوق الوارد — three of them and the student hits `MAX_OPEN_PER_IDENTITY`
 * and can no longer ask anything at all. One thread per student per
 * conversation is also simply what he wants to read.
 *
 * The transcript travels again, and carries only what has been said since:
 * the earlier turns are already in the thread, a few messages up.
 */
export async function postAssistantMessage(
  conversationId: string,
  message: string,
  transcript?: readonly AssistantTranscriptTurn[],
): Promise<ConversationThread> {
  const carried = carry(transcript);
  return apiPost(
    `/api/assistant/conversations/${conversationId}/messages`,
    ConversationThreadSchema,
    {
      message,
      ...(carried.length > 0 ? { transcript: carried } : {}),
    },
  );
}

/**
 * Where the handoff has got to, for the card المساعد raises under its own
 * answer.
 *
 * `needsIdentity` is the guest's branch and the reason this is not a boolean.
 * A signed-in student's question can be sent the instant المساعد gives up —
 * the platform already holds their name and their number. A guest's cannot:
 * there is nowhere for the answer to come back to, so the promise «هبعت
 * الرسالة للمهندس أيمن» cannot be kept until they have typed one, and the card
 * asks for it instead of claiming something untrue.
 */
export type HandoffState = 'idle' | 'sending' | 'sent' | 'needsIdentity' | 'failed';
