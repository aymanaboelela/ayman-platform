'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Pencil, Play, Trash2, X } from 'lucide-react';
import { LessonNoteSchema, NOTE_BODY_MAX, type LessonNote } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { apiDelete, apiPatch } from '@/lib/api';
import { formatDuration } from '@/lib/format';

const c = engagementCopy.notes.panel;

/**
 * One note — its minute, its text, and edit/remove in place. Shared by the
 * panel under the video and by «ملاحظاتي», which differ only in what the
 * minute does: on the lesson page it seeks the player (`onJump`), on the
 * notebook it is a link that opens the lesson at that second (`jumpHref`).
 */
export function NoteItem({
  note,
  onJump,
  jumpHref,
  onChanged,
  onRemoved,
}: {
  note: LessonNote;
  onJump?: (seconds: number) => void;
  jumpHref?: string;
  onChanged: (note: LessonNote) => void;
  onRemoved: (id: string) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'remove'>('view');
  const [draft, setDraft] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const at = note.positionSeconds;
  const time = at === null ? null : formatDuration(at);

  async function save(): Promise<void> {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      onChanged(LessonNoteSchema.parse(await apiPatch(`/api/me/notes/${note.id}`, { body })));
      setMode('view');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await apiDelete(`/api/me/notes/${note.id}`);
      onRemoved(note.id);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const chip =
    time === null ? (
      <span className="eg-note__time" data-general="true">
        {c.general}
      </span>
    ) : jumpHref ? (
      <Link href={jumpHref} className="eg-note__time" aria-label={formatCopy(c.jump, { time })}>
        <Play className="size-3.5" aria-hidden="true" />
        <span className="eg-ltr">{time}</span>
      </Link>
    ) : (
      <button
        type="button"
        className="eg-note__time"
        aria-label={formatCopy(c.jump, { time })}
        onClick={() => at !== null && onJump?.(at)}
      >
        <Play className="size-3.5" aria-hidden="true" />
        <span className="eg-ltr">{time}</span>
      </button>
    );

  return (
    <li className="eg-note">
      <div className="eg-note__head">
        {chip}
        {mode === 'view' ? (
          <div className="eg-note__tools">
            <button type="button" className="eg-icon-btn" aria-label={c.edit} onClick={() => setMode('edit')}>
              <Pencil className="size-4" aria-hidden="true" />
            </button>
            <button type="button" className="eg-icon-btn" aria-label={c.remove} onClick={() => setMode('remove')}>
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {mode === 'edit' ? (
        <div className="eg-note__edit">
          <textarea
            className="eg-textarea"
            value={draft}
            maxLength={NOTE_BODY_MAX}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={c.edit}
          />
          <div className="eg-note__actions">
            <button type="button" className="eg-btn eg-btn--solid" disabled={busy || !draft.trim()} onClick={() => void save()}>
              <Check className="size-4" aria-hidden="true" />
              {c.save}
            </button>
            <button
              type="button"
              className="eg-btn"
              onClick={() => {
                setDraft(note.body);
                setMode('view');
              }}
            >
              <X className="size-4" aria-hidden="true" />
              {c.cancel}
            </button>
          </div>
        </div>
      ) : (
        <p className="eg-note__body">{note.body}</p>
      )}

      {mode === 'remove' ? (
        <div className="eg-note__confirm" role="alert">
          <span>{c.removeConfirm}</span>
          <div className="eg-note__actions">
            <button type="button" className="eg-btn eg-btn--danger" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="size-4" aria-hidden="true" />
              {c.remove}
            </button>
            <button type="button" className="eg-btn" onClick={() => setMode('view')}>
              {c.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {failed ? <p className="eg-error">{c.failed}</p> : null}
    </li>
  );
}
