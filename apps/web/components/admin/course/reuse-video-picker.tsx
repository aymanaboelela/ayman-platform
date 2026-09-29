'use client';

import { useState } from 'react';
import { Check, Film, Library, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { ReusableVideo } from '@ayman/contracts/admin/video-upload';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { attachVideoAction, reusableVideosAction } from '@/app/(admin)/admin/courses/actions';

const c = copy.admin.lesson;

/** «١:٠٥:٣٠» / «٤٥:١٢» — the length is how two «الدرس الأول» are told apart. */
function duration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * «اختار فيديو متروفع قبل كده» — put a video that is already in the bucket on
 * this lesson.
 *
 * The case it exists for: the same lecture in the عربي and the لغات course.
 * Uploading it twice doubled the wait AND the storage bill; pointing the
 * second lesson at the first file costs neither. The list is fetched when the
 * dialog opens, not with the page — the course editor does not pay for it on
 * every load.
 */
export function ReuseVideoPicker({
  courseId,
  lessonId,
  hasVideo,
  onDone,
}: {
  courseId: string;
  lessonId: string;
  /** The lesson plays something now — say it is kept, not deleted. */
  hasVideo: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<ReusableVideo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    setFailed(false);
    const result = await reusableVideosAction();
    if (result === null) setFailed(true);
    else setVideos(result.videos);
  }

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setChosen(null);
      setQuery('');
      void load();
    }
  }

  async function attach() {
    if (chosen === null) return;
    setPending(true);
    const result = await attachVideoAction(courseId, lessonId, chosen);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setOpen(false);
    toast.success(c.videoReuseDone);
    onDone?.();
  }

  const needle = query.trim().toLowerCase();
  const shown = (videos ?? []).filter((video) =>
    needle === ''
      ? true
      : [video.lessonTitle, video.courseTitle, video.sectionTitle, video.sourceName]
          .filter((part): part is string => part !== null)
          .some((part) => part.toLowerCase().includes(needle)),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 text-[length:var(--fs-text-sm)] font-medium text-accent-text transition-colors duration-[160ms] hover:bg-accent/20"
        >
          <Library className="size-4" aria-hidden="true" />
          {c.videoReuseOpen}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{c.videoReuseTitle}</DialogTitle>
          <DialogDescription>{c.videoReuseHint}</DialogDescription>
        </DialogHeader>

        <label className="relative block">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={c.videoReuseSearch}
            aria-label={c.videoReuseSearch}
            className="h-10 w-full rounded-md border border-line bg-surface-1 ps-9 pe-3 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
        </label>

        <div className="max-h-[min(24rem,55svh)] overflow-y-auto rounded-md border border-line-subtle" role="listbox" aria-label={c.videoReuseTitle}>
          {failed ? (
            <p className="p-4 text-center text-[length:var(--fs-text-sm)] text-err">{c.videoReuseLoadFailed}</p>
          ) : videos === null ? (
            <div className="space-y-2 p-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-md bg-surface-2" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="p-4 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
              {videos.length === 0 ? c.videoReuseEmpty : c.videoReuseNoMatch}
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {shown.map((video) => {
                const here = video.lessonIds.includes(lessonId);
                const others = video.lessonIds.filter((id) => id !== lessonId).length;
                const selected = chosen === video.videoId;
                return (
                  <li key={video.videoId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={here}
                      onClick={() => setChosen(video.videoId)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors duration-[160ms]',
                        selected ? 'bg-accent/15' : 'hover:bg-surface-2',
                        here && 'cursor-default opacity-60',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-md',
                          selected ? 'bg-accent text-[#1A1206]' : 'bg-surface-3 text-fg-muted',
                        )}
                        aria-hidden="true"
                      >
                        {selected ? <Check className="size-4" /> : <Film className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[length:var(--fs-text-sm)] font-medium text-fg">
                          {video.lessonTitle ?? video.sourceName ?? video.videoId}
                        </span>
                        <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">
                          {[video.courseTitle, video.sectionTitle].filter(Boolean).join(' · ')}
                        </span>
                        {video.sourceName ? (
                          <span dir="auto" className="mono block truncate text-start text-[length:var(--fs-text-xs)] text-fg-subtle">
                            {video.sourceName}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {duration(video.durationSeconds) ? (
                          <span dir="ltr" className="mono tabular text-[length:var(--fs-text-xs)] text-fg-muted">
                            {duration(video.durationSeconds)}
                          </span>
                        ) : null}
                        {here ? (
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                            {c.videoReuseHere}
                          </span>
                        ) : video.kept ? (
                          <span className="rounded-full bg-[color-mix(in_oklab,var(--warn)_15%,transparent)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-warn">
                            {c.videoReuseKept}
                          </span>
                        ) : others > 1 ? (
                          <span className="text-[length:var(--fs-text-xs)] text-fg-subtle">
                            {formatCopy(c.videoReuseAlsoOn, { n: others - 1 })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {hasVideo ? <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.videoReuseReplaceNote}</p> : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              {copy.admin.common.cancel}
            </Button>
          </DialogClose>
          <Button onClick={() => void attach()} disabled={chosen === null || pending} aria-busy={pending}>
            {c.videoReuseConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
