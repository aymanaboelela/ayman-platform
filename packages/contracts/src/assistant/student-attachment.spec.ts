import { describe, expect, it } from 'vitest';
import { MAX_VOICE_SECONDS } from '@ayman/contracts/admin/media';
import {
  MAX_STUDENT_ATTACHMENTS_PER_DAY,
  MAX_STUDENT_ATTACHMENT_BYTES,
  PostMessageSchema,
  StudentAttachmentInputSchema,
} from './conversation';

/**
 * Students can attach a photo or a voice note. They could not before, and the
 * comment that forbade it named three real objections — an upload endpoint
 * costing `media:write`, no storage quota, and account holders who are
 * fifteen. These tests pin the answers, so a later "simplification" that reuses
 * the instructor's wide schema here fails loudly.
 */
const key = 'msg/ab/00000000-0000-4000-8000-000000000000.webp';

const attachment = {
  storageKey: key,
  filename: 'photo.jpg',
  sizeBytes: 1024,
};

describe('StudentAttachmentInputSchema', () => {
  it('accepts a plain image attachment', () => {
    expect(StudentAttachmentInputSchema.safeParse(attachment).success).toBe(true);
  });

  it('accepts a voice note with a duration', () => {
    const result = StudentAttachmentInputSchema.safeParse({
      ...attachment,
      storageKey: 'msg/ab/00000000-0000-4000-8000-000000000000.webm',
      durationSeconds: 42,
    });
    expect(result.success).toBe(true);
  });

  it('⚠️ caps size at the VOICE ceiling, not the document one', () => {
    // The whole point of a separate schema. The instructor's
    // `MessageAttachmentInputSchema` allows 95 MiB because he sends lecture
    // PDFs; a student sends a photo and a voice note, and 20 MiB covers both
    // with room to spare.
    expect(
      StudentAttachmentInputSchema.safeParse({
        ...attachment,
        sizeBytes: MAX_STUDENT_ATTACHMENT_BYTES,
      }).success,
    ).toBe(true);

    expect(
      StudentAttachmentInputSchema.safeParse({
        ...attachment,
        sizeBytes: MAX_STUDENT_ATTACHMENT_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it('rejects a storage key that is not shaped like one', () => {
    // The value comes back from the client after an upload, so it is
    // attacker-controlled. Without the check a message could name
    // `../../etc/passwd` and the storage layer would be the only thing between
    // that and a read.
    for (const bad of ['../../etc/passwd', 'msg/ab/../x.webp', '/absolute/path.webp', '']) {
      expect(
        StudentAttachmentInputSchema.safeParse({ ...attachment, storageKey: bad }).success,
        `storage key must be rejected: ${bad}`,
      ).toBe(false);
    }
  });

  it('bounds the voice duration on both ends', () => {
    expect(
      StudentAttachmentInputSchema.safeParse({ ...attachment, durationSeconds: 0 }).success,
    ).toBe(false);
    expect(
      StudentAttachmentInputSchema.safeParse({
        ...attachment,
        durationSeconds: MAX_VOICE_SECONDS + 1,
      }).success,
    ).toBe(false);
    expect(
      StudentAttachmentInputSchema.safeParse({
        ...attachment,
        durationSeconds: MAX_VOICE_SECONDS,
      }).success,
    ).toBe(true);
  });

  it('is strict — an unknown key is a 400, not a silently stripped field', () => {
    expect(
      StudentAttachmentInputSchema.safeParse({ ...attachment, author: 'admin' }).success,
    ).toBe(false);
  });

  it('states a daily cap the client can show', () => {
    // The quota the original note said did not exist. A number rather than a
    // byte budget, because a count is what can be said back to a student.
    expect(MAX_STUDENT_ATTACHMENTS_PER_DAY).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_STUDENT_ATTACHMENTS_PER_DAY)).toBe(true);
  });
});

describe('PostMessageSchema with an attachment', () => {
  it('accepts words alone, as it always has', () => {
    expect(PostMessageSchema.safeParse({ message: 'فين الفيديو؟' }).success).toBe(true);
  });

  it('accepts a file with NO caption', () => {
    // The DB CHECK `conversation_messages_body_length` allows exactly this: a
    // message may be a file with no words. A photo of a problem is a complete
    // thought.
    const result = PostMessageSchema.safeParse({ message: '', attachment });
    expect(result.success).toBe(true);
  });

  it('accepts a file WITH a caption', () => {
    expect(
      PostMessageSchema.safeParse({ message: 'المسألة دي', attachment }).success,
    ).toBe(true);
  });

  it('⚠️ refuses an EMPTY message with no attachment', () => {
    // The one combination that must stay impossible. Relaxing the minimum to
    // allow a bare file would otherwise let a client insert blank bubbles.
    const result = PostMessageSchema.safeParse({ message: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('اكتب رسالة أو ارفق ملف');
      expect(result.error.issues[0]?.path).toEqual(['message']);
    }
  });

  it('refuses a one-character message with no attachment', () => {
    expect(PostMessageSchema.safeParse({ message: 'أ' }).success).toBe(false);
  });

  it('still enforces the 2000-character ceiling', () => {
    expect(PostMessageSchema.safeParse({ message: 'ا'.repeat(2001) }).success).toBe(false);
  });

  it('accepts an explicit null attachment', () => {
    // `.nullish()`, so a client that always sends the key does not have to
    // omit it conditionally.
    expect(
      PostMessageSchema.safeParse({ message: 'سؤال', attachment: null }).success,
    ).toBe(true);
  });

  it('is strict — an unknown key is refused', () => {
    expect(
      PostMessageSchema.safeParse({ message: 'سؤال', author: 'admin' }).success,
    ).toBe(false);
  });
});
