'use client';

import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { CheckCircle2, Loader2, Lock, Paperclip, RotateCcw, SendHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import {
  MESSAGE_MAX,
  type ConversationStatus,
  type MessageAttachmentInput,
} from '@ayman/contracts/assistant/conversation';
import { ALLOWED_DOCUMENT_EXT, ALLOWED_UPLOAD_EXT } from '@ayman/contracts/admin/media';
import { Button } from '@ayman/ui/components/button';
import { formatBytes } from '@/components/assistant/message-attachment';
import { useAutoGrow } from '@/components/assistant/use-auto-grow';
import { uploadConversationAttachment, type UploadFailure } from '@/lib/upload-client';
import { VoiceRecorder } from '@/components/assistant/voice-recorder';
import { replyAction, setStatusAction } from '../actions';
import type { PendingReply } from './admin-chat';

const c = copy.assistant.inbox;
const cc = copy.assistant.chat;

/** The composer stops growing here and scrolls — about eight lines. */
const COMPOSER_MAX_PX = 224;

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
export function ThreadActions({
  id,
  status,
  onPending,
}: {
  id: string;
  status: ConversationStatus;
  /**
   * `AdminChat`'s optimistic setter — called INSIDE the send transition, which
   * is what ties the placeholder bubble's lifetime to the action's.
   */
  onPending?: (reply: PendingReply | null) => void;
}) {
  const [message, setMessage] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(field, message, COMPOSER_MAX_PX);
  /** The uploaded receipt, or `null`. The bytes are already on the server. */
  const [attachment, setAttachment] = useState<MessageAttachmentInput | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  /*
   * Its own transition, so a reply in flight does not relabel the close button
   * «بنقفل…» — one shared `pending` used to say the thread was closing every
   * time he pressed send.
   */
  const [statusPending, startStatusTransition] = useTransition();
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

  /**
   * A finished recording, through the SAME upload endpoint every attachment
   * uses — the server routes it to the audio pipeline off the extension, and
   * then sniffs the container to make sure the extension was telling the truth.
   *
   * The duration is carried alongside because it cannot be recovered from the
   * bytes: `MediaRecorder` writes no length into a live WebM header. See
   * `VoiceRecorder`.
   */
  async function recorded(file: File, durationSeconds: number) {
    setUploading(true);
    setProgress(0);
    const result = await uploadConversationAttachment(file, setProgress);
    setUploading(false);

    if (!result.ok) {
      toast.error(UPLOAD_MESSAGE[result.reason]);
      return;
    }
    setAttachment({ ...result.value, durationSeconds });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;

    const body = message;
    const staged = attachment;
    /*
     * The box empties the moment he presses send — a messenger's contract,
     * and the placeholder bubble above is where the words went. They come
     * BACK on a failure: a failed send that also lost what he wrote would be
     * the one outcome worse than the failure itself. The attachment travels
     * with them — it is part of the same message, and leaving it staged after
     * a success would attach it twice.
     */
    setMessage('');
    setAttachment(null);
    startTransition(async () => {
      onPending?.({ body, attachment: staged, at: new Date().toISOString() });
      const result = await replyAction(id, body, staged);
      if (result.ok) return;
      setMessage(body);
      setAttachment(staged);
      toast.error(c.replyFailed);
    });
  }

  /**
   * Enter sends and Shift+Enter breaks the line — WhatsApp Web's rule, which is
   * the one in his fingers. Only on a real keyboard: on a phone the on-screen
   * Enter is the only way to start a new paragraph, and a reply there goes out
   * with the round button, exactly as it does in the app it imitates.
   *
   * `isComposing` because an IME's Enter confirms a candidate, not a message.
   */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function toggleStatus() {
    startStatusTransition(async () => {
      const result = await setStatusAction(id, isClosed ? 'open' : 'closed');
      if (!result.ok) toast.error(c.replyFailed);
    });
  }

  if (isClosed) {
    return (
      <div className="chat-closed">
        <p className="chat-closed__note">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {c.closed}
        </p>
        <Button type="button" variant="secondary" disabled={statusPending} onClick={toggleStatus}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {c.reopen}
        </Button>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={submit} className="chat-composer">
      {uploading ? (
        /*
          A real progress bar and not a spinner alone: a 90 MB deck over a
          phone connection is a minute of silence otherwise, and silence during
          an upload reads as a broken button. The value is the XHR's own
          `upload.onprogress`. Along the composer's top edge, where a messenger
          draws it.
        */
        <div className="chat-composer__progress" role="status" aria-label={c.attaching}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}

      <div className="chat-composer__inner">
        {/*
          The staged file, above the box — where it reads as part of the
          message being composed rather than as a setting. Uploaded ALREADY:
          what is held here is a storage key, so pressing send is instant
          however big the deck was.
        */}
        {attachment ? (
          <div className="chat-staged">
            <span className="chat-staged__icon" aria-hidden="true">
              <Paperclip className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[length:var(--fs-text-sm)] font-medium text-fg">
                {attachment.filename}
              </span>
              <span className="chat-staged__size">{formatBytes(attachment.sizeBytes)}</span>
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label={c.attachRemove}
              className="chat-icon-button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {uploading ? (
          <p className="chat-composer__status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {c.attaching}
          </p>
        ) : null}

        <div className="chat-composer__row">
          <div className="chat-composer__field">
            {/*
              A real `<input type="file">`, hidden, driven by a button — the
              pattern every other upload field in this admin uses. A button
              lets the disabled state while an upload is in flight be
              expressed once. Inside the field, where every messenger keeps
              its paperclip.
            */}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              onChange={pickFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={pending || uploading}
              onClick={() => fileInput.current?.click()}
              aria-label={c.attach}
              title={c.attach}
              className="chat-icon-button"
            >
              <Paperclip className="size-5" aria-hidden="true" />
            </button>

            <label htmlFor="inbox-reply" className="sr-only">
              {c.replyLabel}
            </label>
            <textarea
              ref={field}
              id="inbox-reply"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={c.replyPlaceholder}
              rows={1}
              // The same ceiling the contract enforces, so the limit is felt
              // while typing rather than discovered on submit. No `required`:
              // a reply may be a file with no caption, and the browser's own
              // validation would block that before `submit` ran.
              maxLength={MESSAGE_MAX}
              className="chat-composer__input"
            />
          </div>

          {/* Beside the send button, because it is the other way to say
              something: WhatsApp's microphone lives exactly here. Disabled
              while an upload is in flight for the same reason the paperclip
              is — one file per message. */}
          <VoiceRecorder onRecorded={recorded} disabled={pending || uploading} />

          <button
            type="submit"
            disabled={!canSend}
            aria-label={pending ? c.replying : c.reply}
            title={c.reply}
            className="chat-send"
          >
            {pending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <SendHorizontal className="chat-send__icon size-5" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="chat-composer__foot">
          <p className="chat-composer__hint">
            <span className="chat-keys">
              <kbd>Enter</kbd> {cc.enterToSend} · <kbd>Shift</kbd>+<kbd>Enter</kbd>{' '}
              {cc.shiftEnterNewline}
            </span>
            <span className="chat-composer__limits">{c.attachHint}</span>
          </p>

          {/* Its own act (see the note above the component), so its own
              button — quiet, and out of the way of the send button. */}
          <button
            type="button"
            disabled={pending || statusPending}
            onClick={toggleStatus}
            className="chat-composer__close"
          >
            <Lock className="size-3.5" aria-hidden="true" />
            {statusPending ? c.closing : c.close}
          </button>
        </div>
      </div>
    </form>
  );
}
