'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { CheckCircle2, CircleAlert, ExternalLink, ImageUp, Save, Sparkles, WandSparkles, X } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@ayman/ui/components/sheet';
import { youtubeStudioCopy } from '@ayman/contracts/copy/youtube-studio';
import {
  YOUTUBE_CATEGORIES,
  YOUTUBE_DESCRIPTION_MAX,
  YOUTUBE_EDUCATION_CATEGORY,
  YOUTUBE_TAGS_MAX_CHARS,
  YOUTUBE_TITLE_MAX,
  cleanTag,
  hasChapters,
  youtubeTagsLength,
  youtubeVideoFlags,
  type YoutubeCourseOption,
  type YoutubeSuggestion,
  type YoutubeVideoDetail,
  type YoutubeVideoUpdate,
} from '@ayman/contracts/youtube/studio';
import { CHECKLIST, checklist } from '@/lib/youtube-studio/health';
import { uploadYoutubeThumbnail } from '@/lib/youtube-studio/upload-thumbnail';
import { loadVideoAction, saveVideoAction, suggestAction } from './actions';
import { CheckIcon, formatDate } from './parts';

const y = youtubeStudioCopy;
const e = y.editor;

/** `new` is the «نزل فيديو جديد» flow: suggestion first, the button says «نشر التعديلات». */
export type EditorMode = 'edit' | 'new';

interface Form {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

type Notice = { tone: 'ok' | 'err' | 'info'; text: string } | null;

/** Per-viewer convenience only: the course picked last time is the likely one again. */
const COURSE_KEY = 'yt-studio:last-course';

function readLastCourse(): string {
  try {
    return window.localStorage.getItem(COURSE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeLastCourse(id: string): void {
  try {
    window.localStorage.setItem(COURSE_KEY, id);
  } catch {
    // Private window or blocked storage — the dropdown just starts empty next time.
  }
}

/** The fields that differ from what YouTube has — a save sends ONLY these (the API keeps the rest). */
function diff(form: Form, base: Form): YoutubeVideoUpdate {
  const patch: YoutubeVideoUpdate = {};
  if (form.title.trim() !== base.title) patch.title = form.title.trim();
  if (form.description !== base.description) patch.description = form.description;
  if (form.tags.join('\u0000') !== base.tags.join('\u0000')) patch.tags = form.tags;
  if (form.categoryId !== base.categoryId) patch.categoryId = form.categoryId;
  return patch;
}

/**
 * One video's SEO, in a side sheet over the list.
 *
 * Nothing here writes until حفظ: «اقترح لي» only fills the fields, and the
 * save sends just the fields that changed — the API reads the current snippet
 * and writes it back whole, so nothing the form does not show is wiped.
 */
export function VideoEditor({
  videoId,
  mode,
  courses,
  siteHost,
  canWrite,
  canPublish,
  onClose,
  onSaved,
  onThumbnail,
}: {
  videoId: string;
  mode: EditorMode;
  courses: readonly YoutubeCourseOption[];
  siteHost: string;
  onThumbnail: (detail: YoutubeVideoDetail) => void;
  canWrite: boolean;
  canPublish: boolean;
  onClose: () => void;
  onSaved: (detail: YoutubeVideoDetail) => void;
}) {
  const [detail, setDetail] = useState<YoutubeVideoDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  // The portal never renders on the server, so reading storage here cannot mismatch hydration.
  const [courseId, setCourseId] = useState(() => (typeof window === 'undefined' ? '' : readLastCourse()));
  const [suggestion, setSuggestion] = useState<YoutubeSuggestion | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [suggesting, startSuggesting] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void loadVideoAction(videoId).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      setDetail(result.data);
      setForm({
        title: result.data.title,
        description: result.data.description,
        tags: result.data.tags,
        categoryId: result.data.categoryId,
      });
    });
    return () => {
      live = false;
    };
  }, [videoId]);

  const base: Form | null = detail
    ? { title: detail.title, description: detail.description, tags: detail.tags, categoryId: detail.categoryId }
    : null;
  const patch = form && base ? diff(form, base) : {};
  const dirty = Object.keys(patch).length > 0;

  const tagsLength = form ? youtubeTagsLength(form.tags) : 0;
  const over =
    !!form &&
    (form.title.trim().length === 0 ||
      form.title.length > YOUTUBE_TITLE_MAX ||
      form.description.length > YOUTUBE_DESCRIPTION_MAX ||
      tagsLength > YOUTUBE_TAGS_MAX_CHARS);

  // The checklist reads the FORM, so it turns green as the suggestion lands.
  const liveChecks = useMemo(() => {
    if (!form || !detail) return null;
    return checklist({
      title: form.title,
      flags: youtubeVideoFlags({ description: form.description, tags: form.tags }, siteHost),
      categoryId: form.categoryId,
      thumbnailSetHere: detail.thumbnailSetHere,
    });
  }, [form, detail, siteHost]);

  const close = () => {
    if (dirty && !window.confirm(e.discardConfirm)) return;
    onClose();
  };

  const addTags = (raw: string) => {
    if (!form) return;
    const fresh = raw.split(',').map(cleanTag).filter(Boolean);
    if (fresh.length === 0) return;
    const seen = new Set(form.tags.map((tag) => tag.toLowerCase()));
    setForm({ ...form, tags: [...form.tags, ...fresh.filter((tag) => !seen.has(tag.toLowerCase()))] });
    setTagDraft('');
  };

  const onTagKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '،') {
      event.preventDefault();
      addTags(tagDraft);
    } else if (event.key === 'Backspace' && tagDraft === '' && form && form.tags.length > 0) {
      setForm({ ...form, tags: form.tags.slice(0, -1) });
    }
  };

  const suggest = () => {
    if (!form) return;
    setNotice(null);
    if (courseId) writeLastCourse(courseId);
    startSuggesting(async () => {
      const result = await suggestAction(videoId, courseId || null);
      if (!result.ok) {
        setNotice({ tone: 'err', text: result.message });
        return;
      }
      setSuggestion(result.data);
      setForm((current) =>
        current
          ? {
              ...current,
              title: result.data.title,
              description: result.data.description,
              tags: result.data.tags.length > 0 ? result.data.tags : current.tags,
              // The «كل حاجة» flow files a lesson under «تعليم»; a plain edit leaves the category alone.
              categoryId: mode === 'new' ? YOUTUBE_EDUCATION_CATEGORY : current.categoryId,
            }
          : current,
      );
      setNotice({ tone: 'info', text: e.reviewNote });
    });
  };

  const save = () => {
    if (!dirty || over) return;
    setNotice(null);
    startSaving(async () => {
      const result = await saveVideoAction(videoId, patch);
      if (!result.ok) {
        setNotice({ tone: 'err', text: result.message });
        return;
      }
      setDetail(result.data);
      setForm({
        title: result.data.title,
        description: result.data.description,
        tags: result.data.tags,
        categoryId: result.data.categoryId,
      });
      setSuggestion(null);
      setNotice({ tone: 'ok', text: e.saved });
      onSaved(result.data);
    });
  };

  const pickThumbnail = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    setUploading(true);
    const outcome = await uploadYoutubeThumbnail(videoId, file);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (!outcome.ok) {
      setNotice({ tone: 'err', text: outcome.message });
      return;
    }
    setDetail((current) => (current ? { ...current, thumbnailUrl: outcome.value.thumbnailUrl, thumbnailSetHere: true } : current));
    setNotice({ tone: 'ok', text: e.thumbnailDone });
    onThumbnail(outcome.value);
  };

  const categoryKnown = form ? YOUTUBE_CATEGORIES.some((category) => category.id === form.categoryId) : true;

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : close())}>
      <SheetContent closeLabel={e.close} className="yt-sheet w-[min(100vw,46rem)] gap-0 p-0" aria-describedby={undefined}>
        <header className="yt-sheet__head">
          <SheetTitle className="yt-sheet__title">{mode === 'new' ? y.newVideo.eyebrow : e.title}</SheetTitle>
          <div className="yt-sheet__head-actions">
            <a className="yt-btn yt-btn--plain" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              {e.openOnYoutube}
            </a>
            <button type="button" className="yt-icon-btn" onClick={close} aria-label={e.close}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="yt-sheet__body">
          {loadError ? (
            <p className="yt-notice yt-notice--err" role="alert">
              <CircleAlert className="size-4" aria-hidden="true" />
              {loadError}
            </p>
          ) : !detail || !form ? (
            <div className="yt-editor-skeleton" aria-busy="true" aria-label={e.loading}>
              <span className="yt-skel yt-skel--thumb" />
              <span className="yt-skel yt-skel--line" />
              <span className="yt-skel yt-skel--block" />
              <span className="yt-skel yt-skel--line yt-skel--short" />
            </div>
          ) : (
            <>
              <section className="yt-editor-media">
                <div className="yt-editor-media__frame">
                  {detail.thumbnailUrl ? (
                    // i.ytimg.com is in the CSP.
                    <img src={detail.thumbnailUrl} alt="" className="yt-editor-media__thumb" />
                  ) : null}
                  {detail.privacy ? (
                    <span className="yt-badge" data-privacy={detail.privacy}>
                      {y.privacy[detail.privacy]}
                    </span>
                  ) : null}
                </div>
                <div className="yt-editor-media__side">
                  <p className="yt-field__label">{e.thumbnail}</p>
                  <p className="yt-field__hint">
                    <span className="yt-ltr">JPEG · PNG</span> — {e.thumbnailHint}
                  </p>
                  {canPublish ? (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        className="sr-only"
                        id={`yt-thumb-${videoId}`}
                        onChange={(event) => void pickThumbnail(event.target.files?.[0])}
                      />
                      <label htmlFor={`yt-thumb-${videoId}`} className="yt-btn yt-btn--soft" aria-disabled={uploading}>
                        <ImageUp className="size-4" aria-hidden="true" />
                        {uploading ? e.thumbnailUploading : e.thumbnailPick}
                      </label>
                    </>
                  ) : null}
                  {detail.publishedAt ? <p className="yt-field__hint">{y.newVideo.published(formatDate(detail.publishedAt))}</p> : null}
                </div>
              </section>

              {canWrite ? (
                <section className="yt-suggest" data-mode={mode}>
                  <div className="yt-suggest__head">
                    <WandSparkles className="size-5" aria-hidden="true" />
                    <p>{e.suggestNote}</p>
                  </div>
                  <label className="yt-field">
                    <span className="yt-field__label">{e.suggestCourse}</span>
                    <select className="yt-input" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                      <option value="">{e.suggestNoCourse}</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className={mode === 'new' ? 'yt-btn yt-btn--primary yt-btn--lg' : 'yt-btn yt-btn--accent'}
                    disabled={suggesting}
                    onClick={suggest}
                  >
                    <Sparkles className={suggesting ? 'size-4 animate-pulse' : 'size-4'} aria-hidden="true" />
                    {suggesting ? e.suggesting : mode === 'new' ? y.newVideo.suggestAll : e.suggest}
                  </button>
                  <p className="yt-field__hint">{e.suggestQuota}</p>
                  {suggestion ? (
                    <p className="yt-field__hint">
                      {suggestion.source === 'captions' ? e.suggestFromCaptions(suggestion.chapterCount) : e.suggestFromTitle}
                    </p>
                  ) : null}
                  {suggestion && suggestion.voiceWarnings.length > 0 ? (
                    <p className="yt-notice yt-notice--warn">
                      <CircleAlert className="size-4" aria-hidden="true" />
                      {e.voiceWarning(suggestion.voiceWarnings)}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {notice ? (
                <p className={`yt-notice yt-notice--${notice.tone}`} role={notice.tone === 'err' ? 'alert' : 'status'}>
                  {notice.tone === 'ok' ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <CircleAlert className="size-4" aria-hidden="true" />}
                  {notice.text}
                </p>
              ) : null}

              <div className="yt-fields">
                <label className="yt-field" data-changed={patch.title !== undefined ? 'true' : undefined}>
                  <span className="yt-field__row">
                    <span className="yt-field__label">{e.fieldTitle}</span>
                    <Counter used={form.title.length} max={YOUTUBE_TITLE_MAX} />
                  </span>
                  <input
                    className="yt-input"
                    dir="auto"
                    value={form.title}
                    maxLength={YOUTUBE_TITLE_MAX + 20}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                  />
                </label>

                <label className="yt-field" data-changed={patch.description !== undefined ? 'true' : undefined}>
                  <span className="yt-field__row">
                    <span className="yt-field__label">{e.fieldDescription}</span>
                    <Counter used={form.description.length} max={YOUTUBE_DESCRIPTION_MAX} />
                  </span>
                  <textarea
                    className="yt-input yt-textarea"
                    dir="auto"
                    rows={12}
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                  {hasChapters(form.description) ? null : <span className="yt-field__hint">{y.flags.noChapters}</span>}
                </label>

                <div className="yt-field" data-changed={patch.tags !== undefined ? 'true' : undefined}>
                  <span className="yt-field__row">
                    <span className="yt-field__label" id={`yt-tags-${videoId}`}>
                      {e.fieldTags}
                    </span>
                    <Counter used={tagsLength} max={YOUTUBE_TAGS_MAX_CHARS} />
                  </span>
                  <div className="yt-tags" role="group" aria-labelledby={`yt-tags-${videoId}`}>
                    {form.tags.map((tag) => (
                      <span key={tag} className="yt-tag" dir="auto">
                        {tag}
                        <button
                          type="button"
                          aria-label={e.removeTag(tag)}
                          onClick={() => setForm({ ...form, tags: form.tags.filter((item) => item !== tag) })}
                        >
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                    <input
                      className="yt-tags__input"
                      dir="auto"
                      value={tagDraft}
                      placeholder={e.tagsAdd}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={onTagKey}
                      onBlur={() => addTags(tagDraft)}
                    />
                  </div>
                  <span className="yt-field__hint">{e.tagsHint}</span>
                </div>

                <label className="yt-field" data-changed={patch.categoryId !== undefined ? 'true' : undefined}>
                  <span className="yt-field__label">{e.fieldCategory}</span>
                  <select className="yt-input" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                    {categoryKnown ? null : <option value={form.categoryId}>{e.otherCategory(form.categoryId)}</option>}
                    {YOUTUBE_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.labelAr}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {liveChecks ? (
                <div className="yt-checklist yt-checklist--inline">
                  <p className="yt-checklist__title">{y.newVideo.checklistTitle}</p>
                  <ul>
                    {CHECKLIST.map((key) => (
                      <li key={key} data-check={liveChecks[key]}>
                        <CheckIcon state={liveChecks[key]} />
                        {y.newVideo.checks[key]}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>

        {detail && form && canPublish ? (
          <footer className="yt-sheet__foot">
            <p className="yt-field__hint">{over ? e.overLimit : dirty ? e.unsaved : e.quotaNote}</p>
            <button type="button" className="yt-btn yt-btn--primary yt-btn--lg" disabled={!dirty || over || saving} onClick={save}>
              <Save className="size-5" aria-hidden="true" />
              {saving ? e.saving : mode === 'new' ? e.publish : e.save}
            </button>
          </footer>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Counter({ used, max }: { used: number; max: number }) {
  const ratio = used / max;
  return (
    <span className="yt-counter" data-level={ratio > 1 ? 'over' : ratio > 0.9 ? 'near' : 'ok'}>
      {e.counter(used, max)}
    </span>
  );
}
