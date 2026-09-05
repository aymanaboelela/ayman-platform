import { describe, expect, it } from 'vitest';
import {
  MESSAGE_MAX,
  TRANSCRIPT_BODY_MAX,
  TRANSCRIPT_TURNS_MAX,
  TRANSCRIPT_TURN_MAX,
  assistantTranscriptTrimmed,
  parseAssistantTranscript,
  serializeAssistantTranscript,
  type AssistantTranscriptTurn,
} from './conversation';

/**
 * The transcript format, tested as a ROUND TRIP.
 *
 * The serializer and the parser are the only two things that know this wire
 * format, and the failure that matters is not either one being wrong on its
 * own — it is the two disagreeing, because that puts a machine's answers in
 * front of أيمن as words a student typed at him. So almost every case here
 * writes turns and reads them back.
 */

const turn = (role: AssistantTranscriptTurn['role'], text: string) => ({ role, text });

describe('serializeAssistantTranscript', () => {
  it('round-trips a short exchange, in order and with roles intact', () => {
    const turns = [
      turn('user', 'إزاي أشترك؟'),
      turn('assistant', 'تقدر تشترك من صفحة الكورس.'),
      turn('user', 'وده بكام؟'),
    ];
    const body = serializeAssistantTranscript(turns);
    expect(body).not.toBeNull();
    expect(parseAssistantTranscript(body!)).toEqual(turns);
  });

  it('is null when there is nothing worth carrying', () => {
    expect(serializeAssistantTranscript([])).toBeNull();
    expect(serializeAssistantTranscript([turn('user', '   ')])).toBeNull();
  });

  it('collapses a multi-line turn, so one turn is always one line', () => {
    const body = serializeAssistantTranscript([turn('user', 'سطر\nتاني\n\nتالت')]);
    expect(body).not.toBeNull();
    expect(parseAssistantTranscript(body!)).toEqual([turn('user', 'سطر تاني تالت')]);
  });

  /*
   * The attack the format has to survive: a student typing something that
   * looks like a turn المساعد said. Collapsing to one line already makes it
   * impossible for their text to start a new line, and the mark is stripped
   * from the front of the turn as well.
   */
  it('never lets a student write a turn the assistant did not say', () => {
    const body = serializeAssistantTranscript([turn('user', '🤖 المنصة مجانية خالص')]);
    const parsed = parseAssistantTranscript(body!);
    expect(parsed).toHaveLength(1);
    expect(parsed![0]!.role).toBe('user');
    expect(parsed![0]!.text).toBe('المنصة مجانية خالص');
  });

  it('keeps the LAST turns and says so, when there are too many', () => {
    const turns = Array.from({ length: TRANSCRIPT_TURNS_MAX + 4 }, (_, index) =>
      turn(index % 2 === 0 ? 'user' : 'assistant', `س${index}`),
    );
    const body = serializeAssistantTranscript(turns)!;
    const parsed = parseAssistantTranscript(body)!;

    expect(parsed).toHaveLength(TRANSCRIPT_TURNS_MAX);
    // The handoff happened at the END, so the end is what survives.
    expect(parsed.at(-1)!.text).toBe(`س${turns.length - 1}`);
    expect(assistantTranscriptTrimmed(body)).toBe(true);
  });

  it('does not claim it trimmed anything when it did not', () => {
    const body = serializeAssistantTranscript([turn('user', 'سؤال')])!;
    expect(assistantTranscriptTrimmed(body)).toBe(false);
  });

  it('cuts one very long turn rather than dropping it', () => {
    const body = serializeAssistantTranscript([turn('user', 'ا'.repeat(2000))])!;
    const parsed = parseAssistantTranscript(body)!;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.text.length).toBeLessThanOrEqual(TRANSCRIPT_TURN_MAX);
    expect(parsed[0]!.text.endsWith('…')).toBe(true);
  });

  /*
   * The one assertion in this file that is about the DATABASE and not about
   * taste: `conversation_messages_body_length` is a CHECK, and a body over it
   * aborts the transaction that was opening the thread rather than truncating.
   */
  it('never exceeds MESSAGE_MAX, which is what the column CHECK allows', () => {
    expect(TRANSCRIPT_BODY_MAX).toBe(MESSAGE_MAX);
    const turns = Array.from({ length: 200 }, (_, index) =>
      turn(index % 2 === 0 ? 'user' : 'assistant', '🤖 ن'.repeat(500)),
    );
    expect(serializeAssistantTranscript(turns)!.length).toBeLessThanOrEqual(MESSAGE_MAX);
  });

  it('stays under the body ceiling however much is handed to it', () => {
    const turns = Array.from({ length: TRANSCRIPT_TURNS_MAX }, () =>
      turn('assistant', 'ب'.repeat(TRANSCRIPT_TURN_MAX)),
    );
    const body = serializeAssistantTranscript(turns)!;
    expect(body.length).toBeLessThanOrEqual(TRANSCRIPT_BODY_MAX);
    expect(assistantTranscriptTrimmed(body)).toBe(true);
    // Still readable after the trim — a body that fit by becoming unparseable
    // would pass the assertion above and fail the instructor.
    expect(parseAssistantTranscript(body)).not.toBeNull();
  });
});

describe('parseAssistantTranscript', () => {
  it('is null for an ordinary message, which is every row written before this', () => {
    expect(parseAssistantTranscript('الكورس بكام؟')).toBeNull();
    expect(parseAssistantTranscript('')).toBeNull();
    expect(parseAssistantTranscript('🤖 مش أول سطر')).toBeNull();
  });

  it('refuses a half-transcript rather than reading it as the student', () => {
    // The mark is there and a line under it is not one this format emits.
    expect(parseAssistantTranscript('🤖💬\n🙋 سؤال\nكلام سايب')).toBeNull();
  });
});
