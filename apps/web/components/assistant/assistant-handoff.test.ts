import { describe, expect, it, vi } from 'vitest';
import {
  OpenConversationSchema,
  PostMessageSchema,
  TRANSCRIPT_TURNS_MAX,
  TRANSCRIPT_TURN_WIRE_MAX,
  type AssistantTranscriptTurn,
} from '@ayman/contracts/assistant/conversation';

/**
 * ⚠️ THE HANDOFF USED TO 400 ON EXACTLY THE CHATS THAT NEEDED A PERSON.
 *
 * `HandoffInput.transcript` was documented as «trimmed by the SERVER», and the
 * serializer that does the trimming runs INSIDE the service — behind
 * `OpenConversationSchema`, which caps the array at `TRANSCRIPT_TURNS_MAX` and
 * each `text` at `TRANSCRIPT_TURN_WIRE_MAX` before the service is ever called.
 * So a long conversation was rejected, المساعد's «هبعت الرسالة للمهندس أيمن»
 * became «مقدرناش نوصّل السؤال», and it happened only to students who had been
 * going back and forth long enough to have earned a human.
 *
 * These tests run the CLIENT's body through the SERVER's schema, so they fail
 * if either cap moves and the other does not.
 */

const posted = vi.hoisted(() => ({ body: null as unknown }));

vi.mock('@/lib/api', () => ({
  apiPost: (_path: string, _schema: unknown, body: unknown) => {
    posted.body = body;
    return Promise.resolve({ id: 'c1' });
  },
}));

const { openAssistantConversation, postAssistantMessage } = await import('./assistant-handoff');

/** A chat twice as long as the wire allows, with one absurd turn in it. */
function longChat(): AssistantTranscriptTurn[] {
  const turns: AssistantTranscriptTurn[] = [];
  for (let index = 0; index < TRANSCRIPT_TURNS_MAX * 2; index += 1) {
    turns.push({ role: index % 2 === 0 ? 'user' : 'assistant', text: `سؤال ${index}` });
  }
  turns.push({ role: 'assistant', text: 'ا'.repeat(TRANSCRIPT_TURN_WIRE_MAX + 500) });
  return turns;
}

describe('openAssistantConversation', () => {
  it('cuts a long chat down to a body the server accepts', async () => {
    await openAssistantConversation({
      entryPath: ['root'],
      message: 'وده بكام؟',
      transcript: longChat(),
    });
    expect(OpenConversationSchema.safeParse(posted.body).success).toBe(true);
  });

  /* The handoff is at the END of the conversation, so the tail is what أيمن
     is being asked about — dropping the newest turns would carry the wrong
     half. */
  it('keeps the newest turns and drops the oldest', async () => {
    await openAssistantConversation({
      entryPath: ['root'],
      message: 'وده بكام؟',
      transcript: longChat(),
    });
    const body = posted.body as { transcript: AssistantTranscriptTurn[] };
    expect(body.transcript).toHaveLength(TRANSCRIPT_TURNS_MAX);
    expect(body.transcript.at(-1)!.text).toHaveLength(TRANSCRIPT_TURN_WIRE_MAX);
    // 24 numbered turns plus one over-long one; the last twelve start at 13.
    expect(body.transcript[0]!.text).toBe(`سؤال ${TRANSCRIPT_TURNS_MAX + 1}`);
  });

  /* `.strict()` with `.min(1)` members: an empty array is a 400 for no
     reason, so it is omitted rather than sent. */
  it('omits the field entirely when there is no chat', async () => {
    await openAssistantConversation({ entryPath: ['root'], message: 'سؤال' });
    expect(posted.body).not.toHaveProperty('transcript');
    expect(OpenConversationSchema.safeParse(posted.body).success).toBe(true);
  });

  it('drops a whitespace-only turn rather than sending a 400', async () => {
    await openAssistantConversation({
      entryPath: ['root'],
      message: 'سؤال',
      transcript: [{ role: 'user', text: '   ' }, { role: 'assistant', text: 'رد' }],
    });
    const body = posted.body as { transcript: AssistantTranscriptTurn[] };
    expect(body.transcript).toEqual([{ role: 'assistant', text: 'رد' }]);
    expect(OpenConversationSchema.safeParse(posted.body).success).toBe(true);
  });
});

describe('postAssistantMessage', () => {
  it('cuts the second handoff the same way', async () => {
    await postAssistantMessage('c1', 'سؤال تاني', longChat());
    expect(PostMessageSchema.safeParse(posted.body).success).toBe(true);
    const body = posted.body as { transcript: AssistantTranscriptTurn[] };
    expect(body.transcript).toHaveLength(TRANSCRIPT_TURNS_MAX);
  });

  it('sends a plain follow-up with no transcript at all', async () => {
    await postAssistantMessage('c1', 'سؤال مكتوب بالإيد');
    expect(posted.body).toEqual({ message: 'سؤال مكتوب بالإيد' });
  });
});
