'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, ImagePlus, Keyboard, RefreshCw, X } from 'lucide-react';
// The feature's own copy module, never the root barrel — `client-barrel.test.ts`.
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import { formatCopy } from '@ayman/contracts/format';
import { uploadEssayImage, type UploadFailure } from '@/lib/upload-client';
import { actionErrorMessage, isStaleActionError } from '@/lib/stale-tab';
import { submitEssayAction } from '@/app/(app)/essay/actions';

const c = dailyEssayCopy.student;

/**
 * Every way an upload can fail → what the student reads. A `Record` over the
 * closed union, so a reason added to `UploadFailure` stops compiling here
 * instead of borrowing another reason's sentence.
 */
const UPLOAD_ERROR: Record<UploadFailure, string> = {
  tooLarge: c.errors.tooLarge,
  badType: c.errors.badType,
  unreadable: c.errors.unreadable,
  network: c.errors.network,
  failed: c.errors.uploadFailed,
};

/** One page picked but not yet handed in. */
interface StagedPage {
  /** A `blob:` URL for the thumbnail. Revoked when the page is dropped. */
  preview: string;
  storageKey: string;
  sizeBytes: number;
}

/**
 * The hand-in: photographs of the notebook, or the answer typed.
 *
 * Both ways are open to every student here — unlike الواجب, where typing is a
 * ministry-tablet option. The two are tabs over one button, and an answer is
 * one or the other, never a mix (the contract refuses it).
 *
 * ## The upload is per PAGE, before «تسليم»
 *
 * Each photograph goes browser → API as it is picked, and what crosses into
 * the Server Action afterwards is a key per page: an action is capped at
 * 1 MB, so a phone photo posted through one would vanish with no error. Same
 * shape, and the same reasoning at length, as `LessonHomework`.
 *
 * ## `replacing`
 *
 * An answer handed in and not yet marked can be swapped while the question is
 * open. Then the form starts CLOSED behind a «تغيير الحل» button — a student
 * looking at their own waiting answer should not see an empty upload box that
 * reads as «nothing was received».
 */
export function EssayAnswerForm({
  essayId,
  maxImages,
  maxText,
  replacing = false,
}: {
  essayId: string;
  maxImages: number;
  /** `MAX_ESSAY_TEXT`, passed in so this file imports no Zod-bearing module. */
  maxText: number;
  replacing?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!replacing);
  const [mode, setMode] = useState<'photo' | 'type'>('photo');
  const [staged, setStaged] = useState<StagedPage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  // The blobs still held when the form unmounts — a page left with photos
  // picked and never handed in. Mirrored into a ref in an effect, because the
  // unmount cleanup needs the LATEST list and must not re-run on every change.
  const stagedRef = useRef<StagedPage[]>([]);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  useEffect(
    () => () => {
      for (const page of stagedRef.current) URL.revokeObjectURL(page.preview);
    },
    [],
  );

  const remaining = maxImages - staged.length;

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const chosen = [...files];
    if (chosen.length > remaining) {
      setError(formatCopy(c.errors.tooMany, { max: maxImages }));
      return;
    }

    setBusy(true);
    for (const file of chosen) {
      const result = await uploadEssayImage(essayId, file);
      if (!result.ok) {
        setError(UPLOAD_ERROR[result.reason]);
        break;
      }
      setStaged((current) => [
        ...current,
        { preview: URL.createObjectURL(file), storageKey: result.value.storageKey, sizeBytes: result.value.sizeBytes },
      ]);
    }
    setBusy(false);
    // Otherwise picking the same photograph twice fires no `change` at all.
    if (fileInput.current) fileInput.current.value = '';
  }

  function drop(index: number) {
    setStaged((current) => {
      const page = current[index];
      if (page) URL.revokeObjectURL(page.preview);
      return current.filter((_, position) => position !== index);
    });
  }

  function submit() {
    const typed = mode === 'type';
    if (typed ? text.trim().length === 0 : staged.length === 0) {
      setError(typed ? c.errors.typeEmpty : c.errors.empty);
      return;
    }
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof submitEssayAction>>;
      try {
        result = await submitEssayAction(
          essayId,
          typed
            ? { images: [], text: text.trim() }
            : { images: staged.map((page) => ({ storageKey: page.storageKey, sizeBytes: page.sizeBytes })), text: null },
        );
      } catch (caught) {
        // A deploy landed while the page was open, so the action id this tab
        // holds is gone. Said beside the button rather than replacing the
        // page with the error screen — `lib/stale-tab.ts`.
        if (!isStaleActionError(caught)) throw caught;
        setError(actionErrorMessage(caught, null) ?? c.errors.submitFailed);
        return;
      }
      if (!result.ok) {
        setError(c.errors.submitFailed);
        return;
      }
      for (const page of staged) URL.revokeObjectURL(page.preview);
      setStaged([]);
      setText('');
      if (replacing) setOpen(false);
      // The card is drawn from the page's own read, so the new state arrives
      // with it rather than from a second state machine here.
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="es-form__actions">
        <button type="button" className="eg-btn" onClick={() => setOpen(true)}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {c.form.replace}
        </button>
        <span className="es-form__hint">{c.form.replaceHint}</span>
      </div>
    );
  }

  const inputId = `essay-file-${essayId}`;
  const textId = `essay-text-${essayId}`;

  return (
    <div className="es-form">
      <div>
        <p className="es-form__hint">{c.form.modeLead}</p>
        <div role="tablist" aria-label={c.form.modeLead} className="es-modes mt-2">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'photo'}
            className="es-mode"
            onClick={() => {
              setMode('photo');
              setError(null);
            }}
          >
            <Camera className="size-4" aria-hidden="true" />
            {c.form.modePhoto}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'type'}
            className="es-mode"
            onClick={() => {
              setMode('type');
              setError(null);
            }}
          >
            <Keyboard className="size-4" aria-hidden="true" />
            {c.form.modeType}
          </button>
        </div>
      </div>

      {mode === 'type' ? (
        <div>
          <label htmlFor={textId} className="es-form__title">
            {c.form.typeLabel}
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={maxText}
            dir="auto"
            placeholder={c.form.typePlaceholder}
            className="es-textarea mt-2"
          />
        </div>
      ) : (
        <div>
          <p className="es-form__title">{c.form.photoTitle}</p>
          <p className="es-form__hint">{formatCopy(c.form.photoHint, { max: maxImages })}</p>

          {staged.length > 0 ? (
            <ul className="es-thumbs">
              {staged.map((page, index) => (
                <li key={page.storageKey} className="es-thumb">
                  {/* A plain `<img>` on a `blob:` URL the browser already
                      holds — the optimizer cannot fetch one of those. */}
                  <img src={page.preview} alt="" />
                  <button type="button" className="es-thumb__remove" aria-label={c.form.remove} onClick={() => drop(index)}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* `image/*` and NOT `.heic` beside it: naming HEIC switches off
              iOS's own conversion to JPEG on the way out of the picker. */}
          <input
            ref={fileInput}
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => void pick(event.target.files)}
          />
        </div>
      )}

      <div className="es-form__actions">
        {mode === 'photo' ? (
          <button
            type="button"
            className="eg-btn"
            disabled={busy || remaining <= 0}
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            {busy ? c.form.uploading : c.form.pick}
          </button>
        ) : null}
        <button
          type="button"
          className="eg-btn eg-btn--solid"
          disabled={pending || busy || (mode === 'type' ? text.trim().length === 0 : staged.length === 0)}
          onClick={submit}
        >
          {pending ? c.form.submitting : c.form.submit}
        </button>
        {replacing ? (
          <button type="button" className="eg-btn eg-btn--quiet" disabled={pending} onClick={() => setOpen(false)}>
            {c.form.cancel}
          </button>
        ) : null}
        {mode === 'type' ? (
          <span className="es-form__count">{formatCopy(c.form.typeCount, { n: text.length, max: maxText })}</span>
        ) : staged.length > 0 ? (
          <span className="es-form__hint">
            {staged.length} {c.form.imageUnit}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="es-form__error">
          {error}
        </p>
      ) : (
        <p className="es-form__hint">{c.form.window}</p>
      )}
    </div>
  );
}
