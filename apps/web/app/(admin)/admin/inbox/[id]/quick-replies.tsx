'use client';

import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import { QUICK_REPLIES_MAX, QUICK_REPLY_MAX } from '@ayman/contracts/admin/settings';
import { cn } from '@ayman/ui/lib/cn';
import { apiGetNarrow, apiPut } from '@/lib/api';

const c = copy.assistant.inbox;
const PATH = '/api/admin/conversations/quick-replies';

/** `null` = never set up. Hand-narrowed: two primitives do not need Zod. */
function narrow(value: unknown): string[] | null {
  const list = (value as { quickReplies?: unknown } | null)?.quickReplies;
  if (list === null) return null;
  if (Array.isArray(list) && list.every((item) => typeof item === 'string')) return list;
  throw new Error('unexpected quick replies shape');
}

/**
 * Loaded once per page, the first time the panel opens — not on every live
 * redraw of the thread (`LiveChatRefresh`), which re-runs the page.
 */
let cached: string[] | null | undefined;

/**
 * «ردود جاهزة» — the saved answers, one tap into the composer, and the editor
 * that keeps them. Opens above the composer row; picking one hands the text
 * to `onPick` and closes.
 *
 * Never-saved shows the starter set from copy, and saving once — even an
 * empty list — makes the list his.
 */
export function QuickRepliesPanel({ onPick, onClose }: { onPick: (text: string) => void; onClose: () => void }) {
  const [list, setList] = useState<string[] | null | undefined>(cached);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cached !== undefined) return;
    let cancelled = false;
    void apiGetNarrow(PATH, narrow)
      .then((loaded) => {
        cached = loaded;
        if (!cancelled) setList(loaded);
      })
      // Unreachable or not allowed — the starter set is still useful.
      .catch(() => {
        if (!cancelled) setList(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown: readonly string[] = list ?? c.quickRepliesDefaults;

  function startEditing() {
    setDrafts([...shown]);
    setEditing(true);
  }

  async function save() {
    const next = drafts.map((text) => text.trim()).filter((text) => text.length > 0);
    setSaving(true);
    try {
      await apiPut(PATH, { quickReplies: next });
      cached = next;
      setList(next);
      setEditing(false);
      toast.success(c.quickRepliesSaved);
    } catch {
      toast.error(c.quickRepliesFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-2 rounded-xl border border-line bg-surface-1 p-3 shadow-sm" role="region" aria-label={c.quickReplies}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.quickReplies}</span>
        {list === undefined ? (
          <Loader2 className="size-4 animate-spin text-fg-muted" aria-hidden="true" />
        ) : editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex items-center gap-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-fg"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            {c.quickRepliesBack}
          </button>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1 text-[length:var(--fs-text-xs)] text-accent-text hover:underline"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {c.quickRepliesEdit}
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          {drafts.map((text, index) => (
            <div key={index} className="flex items-start gap-2">
              <textarea
                value={text}
                rows={2}
                maxLength={QUICK_REPLY_MAX}
                placeholder={c.quickRepliesPlaceholder}
                aria-label={c.quickRepliesPlaceholder}
                onChange={(event) =>
                  setDrafts((before) => before.map((item, i) => (i === index ? event.target.value : item)))
                }
                className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg focus:border-accent/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setDrafts((before) => before.filter((_, i) => i !== index))}
                aria-label={c.quickRepliesRemove}
                title={c.quickRepliesRemove}
                className="chat-icon-button text-fg-muted hover:text-[color:var(--err)]"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={drafts.length >= QUICK_REPLIES_MAX}
              onClick={() => setDrafts((before) => [...before, ''])}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:border-accent/50 hover:text-accent-text disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" />
              {c.quickRepliesAdd}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[length:var(--fs-text-sm)] font-semibold text-accent-contrast disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {c.quickRepliesSave}
            </button>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.quickRepliesEmpty}</p>
      ) : (
        <ul className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
          {shown.map((text, index) => (
            <li key={index} className="max-w-full">
              <button
                type="button"
                onClick={() => onPick(text)}
                title={text}
                className={cn(
                  'max-w-full rounded-full border border-line bg-surface-2 px-3 py-1.5 text-start',
                  'text-[length:var(--fs-text-sm)] text-fg transition-colors duration-[160ms] ease-out',
                  'hover:border-accent/50 hover:bg-accent/10 hover:text-accent-text',
                )}
              >
                <span className="line-clamp-2">{text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
