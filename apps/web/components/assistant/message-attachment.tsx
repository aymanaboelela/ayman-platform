import { Download, FileText } from 'lucide-react';
import type { MessageAttachment } from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';
import { VoiceNote } from './voice-note';

/**
 * The file on a message, drawn the same way on both sides of the thread.
 *
 * One component for the instructor's inbox and the student's panel, because
 * the two are the same object seen from two doors: the `path` it is handed
 * already points at whichever route the reader is allowed to follow, so this
 * file never has to know which side it is on. Two copies of it would be two
 * places for the download link to lose its `filename`.
 *
 * ## An image is shown; everything else is a card
 *
 * A picture of a worked solution is only useful if it can be READ without a
 * download, so it renders inline. A PDF cannot be — a 40-page deck in an
 * iframe inside a chat bubble is a scroll trap on a phone and a memory cost on
 * a laptop — so a document gets a name, a size and a way out.
 *
 * ## A plain `<img>`, not `next/image`
 *
 * The bytes come from an `/api/…` route that re-checks the session on every
 * request. The optimizer fetches through its own path and caches the result
 * publicly, which would hand a private conversation attachment to `/_next/image`
 * as a cacheable resource — undoing the whole reason it is gated. `sizes` and
 * `priority` buy nothing here either: it is one image inside a scrolled
 * transcript, never LCP.
 */
export function MessageAttachmentView({
  attachment,
  labels,
  tone,
}: {
  attachment: MessageAttachment;
  /** From `copy.assistant.inbox` or `copy.assistant.thread` — see each caller. */
  labels: { imageAlt: string; download: string };
  /** `own` sits on the accent bubble; `other` on the neutral one. */
  tone: 'own' | 'other';
}) {
  if (attachment.kind === 'voice') {
    /*
     * A player drawn for a chat — see `VoiceNote` — around a real `<audio>`
     * that still loads nothing until it is pressed.
     *
     * `preload="none"` stays the rule: a thread with twenty voice notes must
     * not pull twenty audio files — or hold twenty media players — the moment
     * it opens, and the admin's thread view renders its whole history at once,
     * in a tab that stays open all day. The length is the recorder's own count,
     * because a live-recorded WebM carries none (`duration` reads `Infinity`
     * until the file is seeked end to end).
     */
    return (
      <VoiceNote src={attachment.path} durationSeconds={attachment.durationSeconds} tone={tone} />
    );
  }

  if (attachment.kind === 'image') {
    return (
      <a
        href={attachment.path}
        target="_blank"
        rel="noreferrer"
        className="chat-media"
      >
        <img
          src={attachment.path}
          alt={labels.imageAlt}
          // Bounded in BOTH axes (see `.chat-media img`): the intrinsic size is
          // unknown until it decodes, and an unbounded portrait photo makes the
          // transcript scroll past the reply box on a phone.
          //
          // A long thread's photos decode only as they scroll into view — a
          // decoded phone photo is megabytes, and the admin's thread view has
          // no window on how many it renders.
          loading="lazy"
          decoding="async"
        />
      </a>
    );
  }

  /*
   * THE WHOLE CARD is the download link, rather than a card with a button on
   * the end.
   *
   * The button version competed with the filename for a bubble that
   * shrink-wraps its content, and the filename lost: «المحاضرة الأولى.pdf»
   * broke mid-word to leave room for a control the entire card already implied.
   * One target is also the bigger one on a phone, and it removes the question
   * of what pressing the card — but not the button — was supposed to do.
   *
   * The label survives as the icon's accessible name; a file card that
   * announced only its filename would not say what activating it does.
   *
   * The tile says WHAT the file is before the name is read — «PDF», «PPTX» —
   * because on a thread full of decks the extension is the part he is
   * scanning for. Same one fact `shortenFilename` protects.
   */
  const extension = fileExtension(attachment.filename);
  return (
    <a
      href={attachment.downloadPath}
      className={cn('chat-file', tone === 'own' ? 'chat-file--own' : 'chat-file--other')}
    >
      <span className="chat-file__tile" aria-hidden="true">
        {extension ? (
          <span className="chat-file__ext">{extension}</span>
        ) : (
          <FileText className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        {/*
          ONE line, shortened in the MIDDLE.

          Wrapping was the obvious alternative and it is worse here: a filename
          is one long token with nowhere sensible to break, so the bubble
          inherits `wrap-anywhere` and produces «fixture-.» / «lecture.pdf» —
          two lines, split mid-word, in a card whose whole job is to say which
          file this is. Trimming from the END instead would drop the extension,
          which on a card offering «PDF أو PowerPoint أو Word» is the one part
          worth keeping.

          `title` carries the untrimmed name for anyone who needs it.

          Isolated, with the extension isolated again inside it: in an Arabic
          line «الو….pdf» otherwise renders as «pdf.…الو» — the dot is a
          neutral and takes the paragraph's direction. The outer `<bdi>` lets a
          Latin name stay a Latin line; the inner one keeps «.pdf» one piece.
        */}
        <span title={attachment.filename} className="chat-file__name">
          <FileName name={shortenFilename(attachment.filename)} />
        </span>
        <span className="chat-file__size">{formatBytes(attachment.sizeBytes)}</span>
      </span>
      <span className="chat-file__action">
        <Download className="size-4" aria-hidden="true" />
        <span className="sr-only">{labels.download}</span>
      </span>
    </a>
  );
}

function FileName({ name }: { name: string }) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return <bdi>{name}</bdi>;
  return (
    <bdi>
      {name.slice(0, dot)}
      <bdi dir="ltr">{name.slice(dot)}</bdi>
    </bdi>
  );
}

/**
 * `PDF`, `PPTX`, `DOCX` — the extension as a tile label, or `''` when there is
 * none worth showing. Four letters at most: the tile is a square, and
 * anything longer is not an extension a reader recognises at a glance.
 */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  const extension = name.slice(dot + 1).toUpperCase();
  return /^[A-Z0-9]{1,4}$/.test(extension) ? extension : '';
}

/** Longer than this and the middle is replaced by an ellipsis. */
const NAME_MAX = 28;

/**
 * `المحاضرة الأولى — الوحدة الثالثة.pdf` → `المحاضرة الأولى — ال….pdf`.
 *
 * The EXTENSION is what survives, because it is the part that answers «is this
 * the deck or the worksheet?» and it is the part a plain `text-overflow:
 * ellipsis` would eat first. Everything before the last dot is the part with
 * slack in it.
 *
 * A name with no dot at all keeps its tail rather than losing it — `slice`
 * on an empty extension is the same as a straight truncation, which is the
 * right answer when there is no extension to protect.
 */
export function shortenFilename(name: string): string {
  if (name.length <= NAME_MAX) return name;
  const dot = name.lastIndexOf('.');
  // A leading dot is a hidden file, not an extension — `.gitignore` has no
  // suffix worth saving, so `dot > 0` rather than `dot !== -1`.
  const extension = dot > 0 ? name.slice(dot) : '';
  const head = name.slice(0, Math.max(1, NAME_MAX - extension.length - 1));
  return `${head}…${extension}`;
}

/**
 * `1.4 MB`, in Western digits.
 *
 * Latin digits and Latin units on purpose: every other number in this product
 * that is a MEASUREMENT renders through `ar-EG-u-nu-latn` (see
 * `inboxTimeFormatter`), and «١٫٤ م.ب» is not a unit anybody reading a file
 * size expects. Binary steps, because that is what the ceilings are expressed
 * in — `MAX_DOCUMENT_BYTES` is 95 MiB.
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 10, none above: `9.7 MB` is worth the digit, `94.0 MB`
  // is not.
  const rounded = value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value).toString();
  return `${rounded} ${units[unit]}`;
}
