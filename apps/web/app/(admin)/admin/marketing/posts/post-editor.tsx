'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import {
  CalendarClock,
  CalendarX2,
  Check,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  RotateCcw,
  Save,
  Send,
  Share2,
} from 'lucide-react';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import { SOCIAL_CAPTION_MAX, type SocialPost, type SocialPostFormat } from '@ayman/contracts/social/posts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { lalezar, ruqaa } from '@/lib/fonts';
import { fromCairoInput, suggestedSlot, timeLabel, toCairoInput, dayLabel, cairoDay } from '@/lib/social-posts/calendar';
import type { PostBrand } from '@/lib/social-posts/draw-post';
import { markPublishedAction, patchPostAction, publishPostAction, type ActionResult } from './actions';
import { KindIcon } from './kind-icon';
import { postTitle } from './post-title';
import { usePostImage } from './use-post-image';

const s = socialPostsCopy;

type Notice = { tone: 'ok' | 'err'; text: string } | null;

export interface PostEditorProps {
  post: SocialPost;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: PostBrand;
  connection: { facebook: boolean; instagram: boolean };
  canWrite: boolean;
  canPublish: boolean;
}

/**
 * One post, opened: the picture (drawn here, uploaded once per format), the
 * caption, the shape, the schedule, and the ways out — the Graph API when the
 * accounts are linked, the phone's share sheet / download + copy otherwise.
 *
 * Mounted with `key={post.id}` by the studio, so opening another post starts
 * from that post's own caption instead of carrying the last one's edits.
 */
export function PostEditor({ post: initial, open, onOpenChange, brand, connection, canWrite, canPublish }: PostEditorProps) {
  const fontHost = useRef<HTMLDivElement>(null);
  const [post, setPost] = useState(initial);
  const [caption, setCaption] = useState(initial.caption);
  const [slot, setSlot] = useState(initial.scheduledAt ? toCairoInput(initial.scheduledAt) : suggestedSlot());
  const [permalink, setPermalink] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const editable = canWrite && (post.status === 'draft' || post.status === 'scheduled');
  const connected = connection.facebook || connection.instagram;
  const image = usePostImage({
    post,
    format: post.format,
    kindLabel: s.kinds[post.kind],
    brand,
    fontHost,
    canUpload: editable,
    onUploaded: setPost,
  });
  const imageReady = image.kind === 'ready' && (image.upload === 'done' || (post.imageUrl !== null && post.imageFormat === post.format));
  const dirty = caption.trim() !== post.caption;

  const file = useMemo(
    () => (image.kind === 'ready' ? new File([image.blob], `post-${post.id}.jpg`, { type: 'image/jpeg' }) : null),
    [image, post.id],
  );
  const canShareFile =
    file !== null && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  function run(work: () => Promise<ActionResult<SocialPost>>, success?: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setNotice({ tone: 'err', text: result.message });
        return;
      }
      setPost(result.data);
      setCaption(result.data.caption);
      if (result.data.lastError) setNotice({ tone: 'err', text: result.data.lastError });
      else if (success) setNotice({ tone: 'ok', text: success });
    });
  }

  const save = () => run(() => patchPostAction(post.id, { caption: caption.trim() }), s.saved);
  const changeFormat = (format: SocialPostFormat) => {
    if (format === post.format) return;
    run(() => patchPostAction(post.id, { format, ...(dirty ? { caption: caption.trim() } : {}) }));
  };
  const schedule = () => {
    const at = fromCairoInput(slot);
    if (!at) return;
    run(() => patchPostAction(post.id, { scheduledAt: at.toISOString(), ...(dirty ? { caption: caption.trim() } : {}) }), s.saved);
  };
  const unschedule = () => run(() => patchPostAction(post.id, { scheduledAt: null }), s.saved);
  const skip = () =>
    run(async () => {
      const result = await patchPostAction(post.id, { status: 'skipped' });
      if (result.ok) onOpenChange(false);
      return result;
    });
  const publish = () => {
    if (!window.confirm(s.confirmPublish)) return;
    run(async () => {
      if (dirty) {
        const saved = await patchPostAction(post.id, { caption: caption.trim() });
        if (!saved.ok) return saved;
      }
      return publishPostAction(post.id);
    }, s.statuses.published);
  };
  const markPublished = () => run(() => markPublishedAction(post.id, permalink.trim() || null), s.manualDone);

  const download = () => {
    if (image.kind !== 'ready') return;
    const a = document.createElement('a');
    a.href = image.url;
    a.download = `post-${post.id}.jpg`;
    document.body.append(a);
    a.click();
    a.remove();
  };
  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ tone: 'err', text: s.errorGeneric });
    }
  };
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], text: caption });
    } catch {
      // Dismissing the share sheet rejects; nothing to report.
    }
  };

  const published = post.status === 'published';

  return (
    <>
      {/* The display faces' variables, read by `resolveFonts`. Outside the
          dialog, which mounts in a portal after the effect that needs this. */}
      <div ref={fontHost} className={`${lalezar.variable} ${ruqaa.variable}`} hidden />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent closeLabel={s.close} className="max-w-[min(1040px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-kind={post.kind}>
              <span className="sp-chip">
                <KindIcon kind={post.kind} className="size-3.5" />
                {s.kinds[post.kind]}
              </span>
              <span className="min-w-0 truncate">{postTitle(post.facts)}</span>
            </DialogTitle>
            <DialogDescription>
              <span className="sp-status" data-status={post.status}>
                {s.statuses[post.status]}
              </span>
              {post.scheduledAt && post.status === 'scheduled' ? (
                <span className="ms-2">
                  {dayLabel(cairoDay(post.scheduledAt), { weekday: 'long', day: 'numeric', month: 'long' })} · {timeLabel(post.scheduledAt)}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="sp-editor">
            <div className="grid gap-2">
              <div className="sp-stage" data-format={post.format}>
                {image.kind === 'ready' ? (
                  <img src={image.url} alt={postTitle(post.facts)} />
                ) : (
                  <p className="sp-stage__status">{image.kind === 'failed' ? image.message : s.rendering}</p>
                )}
              </div>
              {image.kind === 'ready' && image.upload === 'failed' ? <p className="sp-error">{s.uploadFailed}</p> : null}
              {editable ? (
                <div className="sp-formats" role="group" aria-label={s.format}>
                  {(['square', 'story'] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      className="sp-format"
                      aria-pressed={post.format === format}
                      disabled={pending}
                      onClick={() => changeFormat(format)}
                    >
                      <span className={format === 'story' ? 'sp-format__shape sp-format__shape--story' : 'sp-format__shape'} />
                      {s.formats[format]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="sp-fields">
              <label className="sp-field">
                <span className="sp-field__label">
                  {s.caption}
                  <span className="sp-field__hint">{s.characters(caption.length, SOCIAL_CAPTION_MAX)}</span>
                </span>
                <textarea
                  className="sp-caption"
                  value={caption}
                  maxLength={SOCIAL_CAPTION_MAX}
                  readOnly={!editable}
                  onChange={(event) => setCaption(event.target.value)}
                />
                <span className="sp-field__hint">{s.captionHint}</span>
              </label>

              {editable ? (
                <div className="sp-actions">
                  <button type="button" className="sp-mini sp-mini--primary" disabled={pending || !dirty || !caption.trim()} onClick={save}>
                    <Save className="size-4" aria-hidden="true" />
                    {pending ? s.saving : s.save}
                  </button>
                  <button
                    type="button"
                    className="sp-mini"
                    disabled={pending || caption === post.suggestedCaption}
                    onClick={() => setCaption(post.suggestedCaption)}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {s.resetCaption}
                  </button>
                </div>
              ) : null}

              {editable ? (
                <div className="sp-field">
                  <label className="sp-field__label" htmlFor={`slot-${post.id}`}>
                    {s.schedule}
                    <span className="sp-field__hint">{s.scheduleHint}</span>
                  </label>
                  <input
                    id={`slot-${post.id}`}
                    type="datetime-local"
                    className="sp-input sp-ltr"
                    value={slot}
                    onChange={(event) => setSlot(event.target.value)}
                  />
                  <div className="sp-actions">
                    <button type="button" className="sp-mini sp-mini--blue" disabled={pending || !fromCairoInput(slot)} onClick={schedule}>
                      <CalendarClock className="size-4" aria-hidden="true" />
                      {s.scheduleAction}
                    </button>
                    {post.status === 'scheduled' ? (
                      <button type="button" className="sp-mini" disabled={pending} onClick={unschedule}>
                        <CalendarX2 className="size-4" aria-hidden="true" />
                        {s.unschedule}
                      </button>
                    ) : null}
                    <button type="button" className="sp-mini sp-mini--danger" disabled={pending} onClick={skip}>
                      <EyeOff className="size-4" aria-hidden="true" />
                      {s.skip}
                    </button>
                  </div>
                  {post.attempts > 0 && post.lastError ? <p className="sp-error">{s.failedAttempts(post.attempts)}</p> : null}
                </div>
              ) : null}

              {notice ? <p className={notice.tone === 'ok' ? 'sp-note' : 'sp-error'}>{notice.text}</p> : null}

              {published ? (
                <div className="sp-links">
                  {post.facebook.permalink ? (
                    <a href={post.facebook.permalink} target="_blank" rel="noreferrer">
                      <ExternalLink className="me-1 inline size-4" aria-hidden="true" />
                      {s.facebook}
                    </a>
                  ) : null}
                  {post.instagram.permalink ? (
                    <a href={post.instagram.permalink} target="_blank" rel="noreferrer">
                      <ExternalLink className="me-1 inline size-4" aria-hidden="true" />
                      {s.instagram}
                    </a>
                  ) : null}
                </div>
              ) : null}

              {!published && canPublish && connected ? (
                <button
                  type="button"
                  className="sp-publish"
                  disabled={pending || !imageReady}
                  onClick={publish}
                >
                  <Send className="size-4" aria-hidden="true" />
                  {pending ? s.publishing : s.publishNow}
                </button>
              ) : null}

              {!published ? (
                <div className="sp-manual">
                  <p className="sp-manual__title">{s.manualTitle}</p>
                  {!connected ? <p className="sp-manual__lead">{s.manualLead}</p> : null}
                  <div className="sp-actions">
                    {canShareFile ? (
                      <button type="button" className="sp-mini sp-mini--primary" onClick={share}>
                        <Share2 className="size-4" aria-hidden="true" />
                        {s.share}
                      </button>
                    ) : null}
                    <button type="button" className="sp-mini" disabled={image.kind !== 'ready'} onClick={download}>
                      <Download className="size-4" aria-hidden="true" />
                      {s.download}
                    </button>
                    <button type="button" className="sp-mini" onClick={copyCaption}>
                      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                      {copied ? s.copied : s.copyCaption}
                    </button>
                  </div>
                  <div className="sp-links">
                    <a href="https://www.facebook.com/" target="_blank" rel="noreferrer">
                      {s.openFacebook}
                    </a>
                    <a href="https://www.instagram.com/" target="_blank" rel="noreferrer">
                      {s.openInstagram}
                    </a>
                  </div>
                  {canPublish ? (
                    <div className="sp-field">
                      <label className="sp-field__hint" htmlFor={`permalink-${post.id}`}>
                        {s.permalinkLabel}
                      </label>
                      <input
                        id={`permalink-${post.id}`}
                        type="url"
                        inputMode="url"
                        className="sp-input sp-ltr"
                        value={permalink}
                        onChange={(event) => setPermalink(event.target.value)}
                      />
                      <div className="sp-actions">
                        <button type="button" className="sp-mini" disabled={pending} onClick={markPublished}>
                          <Check className="size-4" aria-hidden="true" />
                          {s.markPublished}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
