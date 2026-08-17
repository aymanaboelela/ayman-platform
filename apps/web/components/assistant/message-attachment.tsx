import { Download, FileText } from 'lucide-react';
import type { MessageAttachment } from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui/lib/cn';

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
  if (attachment.kind === 'image') {
    return (
      <a
        href={attachment.path}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block overflow-hidden rounded-xl"
      >
        <img
          src={attachment.path}
          alt={labels.imageAlt}
          // Bounded in BOTH axes: the intrinsic size is unknown until it
          // decodes, and an unbounded portrait photo makes the transcript
          // scroll past the reply box on a phone.
          className="max-h-[22rem] w-auto max-w-full object-contain"
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
   */
  return (
    <a
      href={attachment.downloadPath}
      className={cn(
        // `min-w` in a FIXED unit, not a percentage: the bubble around this is
        // shrink-to-fit, so a percentage max/min on it resolves against a width
        // that is itself being derived from this content — measured, a
        // `w-[min(26rem,85%)]` on the bubble had no effect at all. A fixed
        // floor does participate in intrinsic sizing. 16rem is chosen to fit
        // inside the narrowest bubble the layout can produce (85% of a 390px
        // viewport, less the bubble's own padding).
        'mt-1 flex w-full min-w-[16rem] max-w-full items-center gap-2.5 rounded-xl border p-2.5',
        'transition-opacity duration-[160ms] ease-out hover:opacity-80',
        tone === 'own'
          ? // Hardcoded on the accent bubble, which is admin-settable: a
            // `border-line` token here would vanish against whatever colour he
            // picks. Same reasoning as the WhatsApp card in `message-body.tsx`.
            'border-[#1A1206]/20 bg-[#1A1206]/8'
          : 'border-line-subtle bg-surface-1',
      )}
    >
      <FileText className="size-6 shrink-0 opacity-70" aria-hidden="true" />
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
        */}
        <span
          title={attachment.filename}
          className="block truncate text-[length:var(--fs-text-sm)] font-medium"
        >
          {shortenFilename(attachment.filename)}
        </span>
        <span className="mono block text-[length:var(--fs-mono-label)] opacity-70">
          {formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      <span className="grid size-11 shrink-0 place-items-center">
        <Download className="size-4" aria-hidden="true" />
        <span className="sr-only">{labels.download}</span>
      </span>
    </a>
  );
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
