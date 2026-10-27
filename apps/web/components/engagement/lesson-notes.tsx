'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Clock, Plus, StickyNote } from 'lucide-react';
import { LessonNoteSchema, NOTE_BODY_MAX, type LessonNote } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { ApiRequestError, apiPost } from '@/lib/api';
import { currentPlayer, subscribePlayer } from '@/lib/engagement/player-bridge';
import { formatDuration } from '@/lib/format';
import { NoteItem } from './note-item';
import './engagement.css';

const c = engagementCopy.notes.panel;

/** Pinned notes by minute, then the ones on the whole lesson — the server's order. */
function sorted(notes: readonly LessonNote[]): LessonNote[] {
  return [...notes].sort((a, b) => {
    if (a.positionSeconds === null && b.positionSeconds === null) return a.createdAt.localeCompare(b.createdAt);
    if (a.positionSeconds === null) return 1;
    if (b.positionSeconds === null) return -1;
    return a.positionSeconds - b.positionSeconds || a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * The second the player is at, refreshed once a second while a player is
 * published — what «على الدقيقة 12:40» prints. `null` before it is started
 * and on a frame we cannot read.
 */
function usePlayerSecond(enabled: boolean): number | null {
  const handle = useSyncExternalStore(subscribePlayer, currentPlayer, () => null);
  const [second, setSecond] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || !handle) return;
    const tick = () => setSecond(handle.now());
    const timer = window.setInterval(tick, 1000);
    // First reading on the next frame, not synchronously inside the effect.
    const first = window.requestAnimationFrame(tick);
    return () => {
      window.clearInterval(timer);
      window.cancelAnimationFrame(first);
    };
  }, [enabled, handle]);
  return enabled && handle ? second : null;
}

/**
 * «ملاحظاتي» under the lecture: write a note, pin it to the second the video
 * is at, and play from any pinned note. A student who opened a note from the
 * notebook arrives with `?t=` and the player already starts there.
 */
export function LessonNotesPanel({
  lessonId,
  initial,
  hasVideo,
}: {
  lessonId: string;
  initial: LessonNote[];
  hasVideo: boolean;
}) {
  const [notes, setNotes] = useState(() => sorted(initial));
  const [draft, setDraft] = useState('');
  const [pin, setPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const second = usePlayerSecond(hasVideo);

  async function add(): Promise<void> {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const positionSeconds = pin && second !== null ? second : null;
      const note = await apiPost(`/api/me/lessons/${lessonId}/notes`, LessonNoteSchema, { body, positionSeconds });
      setNotes((current) => sorted([...current, note]));
      setDraft('');
    } catch (failure) {
      setError(
        failure instanceof ApiRequestError && failure.status === 409 ? c.limit : c.failed,
      );
    } finally {
      setBusy(false);
    }
  }

  function jump(seconds: number): void {
    currentPlayer()?.seek(seconds);
    document.querySelector('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="eg-panel" aria-labelledby={`notes-${lessonId}`}>
      <header className="eg-panel__head">
        <span className="eg-panel__icon" aria-hidden="true">
          <StickyNote className="size-5" />
        </span>
        <h2 id={`notes-${lessonId}`} className="eg-panel__title">
          {c.title}
        </h2>
        {notes.length > 0 ? <span className="eg-panel__count">{notes.length}</span> : null}
        <Link href="/notes" className="eg-panel__all">
          {c.all}
        </Link>
      </header>

      <form
        className="eg-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <textarea
          className="eg-textarea"
          value={draft}
          rows={2}
          maxLength={NOTE_BODY_MAX}
          placeholder={c.placeholder}
          aria-label={c.placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void add();
            }
          }}
        />
        <div className="eg-compose__row">
          {second !== null ? (
            <label className="eg-pin">
              <input type="checkbox" checked={pin} onChange={(event) => setPin(event.target.checked)} />
              <Clock className="size-4" aria-hidden="true" />
              <span>{c.pin}</span>
              <span className="eg-ltr eg-pin__time">{formatDuration(second)}</span>
            </label>
          ) : (
            <span />
          )}
          <button type="submit" className="eg-btn eg-btn--solid" disabled={busy || !draft.trim()}>
            <Plus className="size-4" aria-hidden="true" />
            {busy ? c.adding : c.add}
          </button>
        </div>
        {error ? <p className="eg-error">{error}</p> : null}
      </form>

      {notes.length === 0 ? (
        <p className="eg-panel__empty">{c.empty}</p>
      ) : (
        <ul className="eg-notes">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onJump={hasVideo ? jump : undefined}
              onChanged={(changed) =>
                setNotes((current) => sorted(current.map((entry) => (entry.id === changed.id ? changed : entry))))
              }
              onRemoved={(id) => setNotes((current) => current.filter((entry) => entry.id !== id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
