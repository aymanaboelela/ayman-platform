'use client';

import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Paperclip, RotateCcw, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import {
  MESSAGE_MAX,
  type ConversationStatus,
  type MessageAttachmentInput,
} from '@ayman/contracts/assistant/conversation';
import { ALLOWED_DOCUMENT_EXT, ALLOWED_UPLOAD_EXT } from '@ayman/contracts/admin/media';
import { Button } from '@ayman/ui/components/button';
import { Field, FieldLabel } from '@ayman/ui/components/field';
import { Textarea } from '@ayman/ui/components/textarea';
import { formatBytes } from '@/components/assistant/message-attachment';
import { uploadConversationAttachment, type UploadFailure } from '@/lib/upload-client';
import { replyAction, setStatusAction } from '../actions';

const c = copy.assistant.inbox;

/**
 * Built from the contracts, never hand-written — the rule every other upload
 * field in this admin follows. A hardcoded list drifts the day a format is
 * added and the only symptom is a file picker that greys out a file the server
 * would have accepted.
 */
const ACCEPT = [...ALLOWED_UPLOAD_EXT, ...ALLOWED_DOCUMENT_EXT]
  .map((extension) => `.${extension}`)
  .join(',');

/** The API's refusal → the one Arabic sentence that explains it. */
const UPLOAD_MESSAGE: Record<UploadFailure, string> = {
  tooLarge: c.attachTooLarge,
  badType: c.attachBadType,
  unreadable: c.attachBadType,
  network: c.attachFailed,
  failed: c.attachFailed,
};

/**
 * Answering and closing — the only two things this screen writes.
 *
 * Both go through Server Actions rather than a browser `fetch`, so the session
 * cookie and the CSRF header are `adminSend`'s problem rather than this
 * component's, and the revalidation that follows a write happens on the server
 * that performed it.
 *
 * ## Closing is a separate act from replying
 *
 * They are not combined into "reply and close", tempting as that is. A reply
 * usually invites another question — the visitor may follow up, which reopens
 * the thread — and a button that silently ended the conversation every time he
 * answered would make following up impossible without him noticing why.
 */
export function ThreadActions({ id, status }: { id: string; status: ConversationStatus }) {
  const [message, setMessage] = useState('');
  /** The uploaded receipt, or `null`. The bytes are already on the server. */
  const [attachment, setAttachment] = useState<MessageAttachmentInput | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const isClosed = status === 'closed';
  /*
   * Words OR a file — the same rule `ReplySchema` enforces, felt here rather
   * than discovered on submit. Sending a lecture with no covering note is an
   * ordinary thing to do; forcing a caption is the friction that ends with the
   * file going out on WhatsApp instead.
   */
  const canSend = !pending && !uploading && (message.trim().length > 0 || attachment !== null);

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately, so choosing the SAME file again after removing it
    // still fires a change event.
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setProgress(0);
    const result = await uploadConversationAttachment(file, setProgress);
    setUploading(false);

    if (!result.ok) {
      toast.error(UPLOAD_MESSAGE[result.reason]);
      return;
    }
    // Replaces rather than appends: one file per message, which is what the
    // three columns on `conversation_messages` say.
    setAttachment(result.value);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;

    startTransition(async () => {
      const result = await replyAction(id, message, attachment);
      if (result.ok) {
        // Cleared only on success: a failed send that also emptied the box
        // would lose what he wrote, which is the one outcome worse than the
        // failure itself. The attachment goes with it — it is part of the same
        // message, and leaving it staged would attach it twice.
        setMessage('');
        setAttachment(null);
        toast.success(c.reply);
        return;
      }
      toast.error(c.replyFailed);
    });
  }

  function toggleStatus() {
    startTransition(async () => {
      const result = await setStatusAction(id, isClosed ? 'open' : 'closed');
      if (!result.ok) toast.error(c.replyFailed);
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      {isClosed ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {c.closed}
          </p>
          <Button type="button" variant="secondary" disabled={pending} onClick={toggleStatus}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {c.reopen}
          </Button>
        </div>
      ) : (
        <form method="post" onSubmit={submit} className="flex flex-col gap-3">
          <Field name="reply">
            <FieldLabel htmlFor="inbox-reply">{c.replyLabel}</FieldLabel>
            <Textarea
              id="inbox-reply"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={c.replyPlaceholder}
              rows={4}
              // The same ceiling the contract enforces, so the limit is felt
              // while typing rather than discovered on submit. No `required`
              // any more: a reply may be a file with no caption, and the
              // browser's own validation would block that before `submit` ran.
              maxLength={MESSAGE_MAX}
            />
          </Field>

          {/*
            The staged file, between the box and the buttons — where it reads
            as part of the message being composed rather than as a setting.
            Uploaded ALREADY: what is held here is a storage key, so pressing
            «ابعت الرد» is instant however big the deck was.
          */}
          {attachment ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-1 p-2.5">
              <Paperclip className="size-4 shrink-0 text-fg-faint" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block wrap-anywhere text-[length:var(--fs-text-sm)] text-fg">
                  {attachment.filename}
                </span>
                <span className="mono block text-[length:var(--fs-mono-label)] text-fg-faint">
                  {formatBytes(attachment.sizeBytes)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label={c.attachRemove}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-faint hover:bg-surface-3 hover:text-fg"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {uploading ? (
            <div>
              <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {c.attaching}
              </p>
              {/*
                A real progress bar and not a spinner alone: a 90 MB deck over
                a phone connection is a minute of silence otherwise, and
                silence during an upload reads as a broken button. The value is
                the XHR's own `upload.onprogress`.
              */}
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full bg-accent transition-[width] duration-[160ms] ease-out"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!canSend}>
                <Send className="size-4" aria-hidden="true" />
                {pending ? c.replying : c.reply}
              </Button>

              {/*
                A real `<input type="file">`, hidden, driven by a button — the
                pattern every other upload field in this admin uses. A styled
                `<label>` would work too; a button lets the disabled state
                while an upload is in flight be expressed once.
              */}
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                onChange={pickFile}
                className="hidden"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={pending || uploading}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip className="size-4" aria-hidden="true" />
                {c.attach}
              </Button>
            </div>

            <Button type="button" variant="ghost" disabled={pending} onClick={toggleStatus}>
              {pending ? c.closing : c.close}
            </Button>
          </div>

          <p className="text-[length:var(--fs-text-xs)] text-fg-faint">{c.attachHint}</p>
        </form>
      )}
    </div>
  );
}
