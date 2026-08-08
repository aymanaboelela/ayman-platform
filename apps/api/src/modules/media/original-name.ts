/**
 * The uploaded file's name, in the encoding it was actually sent in.
 *
 * ## The bug
 *
 * `multipart/form-data` carries the filename inside a `Content-Disposition`
 * header, and RFC 7578 says a UTF-8 name is sent as raw UTF-8 bytes. Multer
 * decodes that header as **latin1** (one byte, one character), so every
 * non-ASCII name arrives as mojibake: each UTF-8 byte becomes its own Latin-1
 * character.
 *
 * Reproduced end to end on 2026-08-08. Sent:
 *
 *     أساسيات البرمجة - المحاضرة الأولى - م. أيمن أبو العلا.pdf
 *
 * Stored, and rendered to the student under the lecture:
 *
 *     Ø£Ø³Ø§Ø³ÙØ§Øª Ø§ÙØ¨Ø±ÙØ¬Ø© - Ø§ÙÙØ­Ø§Ø¶Ø±Ø©…
 *
 * Reported as «مش عايز مسار الملف بتاع PDF يبقى ظاهر كده».
 *
 * ## Why this is safe on names that were never broken
 *
 * The repair is only applied when the round trip is LOSSLESS — when re-encoding
 * the decoded string reproduces the original bytes exactly. That makes it a
 * no-op in the two cases where guessing would do damage:
 *
 *   · a pure-ASCII name (`lecture-01.pdf`) is byte-identical either way;
 *   · a name that is genuinely Latin-1 text and not disguised UTF-8 fails to
 *     decode as UTF-8, produces U+FFFD, and re-encodes to different bytes — so
 *     it is left exactly as it came.
 *
 * Without that guard this would corrupt the second case, which is the usual way
 * a "fix the mojibake" helper becomes the next bug.
 *
 * ## Why the name is only ever DISPLAYED
 *
 * Nothing here reaches a filesystem path. Both pipelines mint their storage key
 * from a UUID and choose the extension from the DETECTED mime, never from this
 * string — so a name can be any bytes at all without becoming a traversal or an
 * extension-confusion problem. This function exists purely so a human reads
 * their own language back.
 */
export function decodeOriginalName(originalname: string): string {
  const asLatin1 = Buffer.from(originalname, 'latin1');
  const asUtf8 = asLatin1.toString('utf8');

  // Lossless round trip? Then the bytes really were UTF-8 read as latin1.
  if (Buffer.from(asUtf8, 'utf8').equals(asLatin1)) return asUtf8;

  return originalname;
}
