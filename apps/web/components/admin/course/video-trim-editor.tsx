'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Flag, Scissors, SkipBack, SkipForward, Undo2, X } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { effectiveSeconds, trimProblem, type VideoCut, type VideoTrim } from '@ayman/contracts/video';
import { cn } from '@ayman/ui/lib/cn';
import { setVideoTrimAction, videoPreviewUrlAction } from '@/app/(admin)/admin/courses/actions';

const c = copy.admin.lesson;

function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * «قص الفيديو» — YouTube Studio's trim, for an uploaded lecture.
 *
 * Watch it here, stop where you want, press a button: «البداية من هنا»,
 * «النهاية هنا», or «اقطع من هنا» … «لحد هنا» for a part out of the middle.
 * The strip under the video shows what stays (the accent) and what is cut
 * (struck through). Saving never touches the file — the student's player skips
 * what is cut — so «رجّع الفيديو كامل» is always one press away.
 */
export function VideoTrimEditor({
  courseId,
  lessonId,
  externalId,
  fullSeconds,
  saved,
  onSaved,
}: {
  courseId: string;
  lessonId: string;
  externalId: string;
  /** The untrimmed length. */
  fullSeconds: number;
  saved: VideoTrim | null;
  onSaved?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [start, setStart] = useState(saved?.start ?? 0);
  const [end, setEnd] = useState<number | null>(saved?.end ?? null);
  const [cuts, setCuts] = useState<VideoCut[]>(saved?.cuts ?? []);
  const [cutFrom, setCutFrom] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  // The preview: the same encrypted ladder the students get, the key fetched
  // with the admin's own session.
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return undefined;
    let hls: { destroy: () => void } | null = null;
    let live = true;
    void (async () => {
      const url = await videoPreviewUrlAction(externalId);
      if (!live || url === null) return;
      const { default: Hls } = await import('hls.js');
      if (!live) return;
      if (Hls.isSupported()) {
        const instance = new Hls();
        hls = instance;
        instance.loadSource(url);
        instance.attachMedia(element);
      } else {
        element.src = url;
      }
    })();
    return () => {
      live = false;
      hls?.destroy();
    };
  }, [externalId]);

  const trim: VideoTrim = { start, end, cuts: [...cuts].sort((a, b) => a.from - b.from) };
  const problem = trimProblem(trim, fullSeconds);
  const after = effectiveSeconds(trim, fullSeconds);
  const whole = start === 0 && end === null && cuts.length === 0;
  const now = Math.round(time);

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(fullSeconds, t));
  };

  async function save(next: VideoTrim | null) {
    setPending(true);
    const result = await setVideoTrimAction(courseId, lessonId, next);
    setPending(false);
    if (result.ok) {
      toast.success(next === null ? c.trimResetDone : c.trimSaved);
      if (next === null) {
        setStart(0);
        setEnd(null);
        setCuts([]);
        setCutFrom(null);
      }
      onSaved?.();
    } else {
      toast.error(result.message);
    }
  }

  // The strip: what stays and what is cut, as percentages of the whole file.
  const pct = (t: number) => `${(Math.max(0, Math.min(fullSeconds, t)) / Math.max(1, fullSeconds)) * 100}%`;
  const removed: { from: number; to: number }[] = [
    ...(start > 0 ? [{ from: 0, to: start }] : []),
    ...trim.cuts,
    ...(end !== null ? [{ from: end, to: fullSeconds }] : []),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <Scissors className="size-4 text-accent-text" aria-hidden="true" />
        <p className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.trimTitle}</p>
      </div>
      <p className="text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted">{c.trimHint}</p>

      <div className="relative aspect-video overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full"
          controls
          playsInline
          controlsList="nodownload"
          disablePictureInPicture
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        />
      </div>

      {/* LTR like every timeline: the file runs left to right. */}
      <div dir="ltr" className="space-y-1">
        <div
          className="relative h-6 cursor-pointer overflow-hidden rounded-md bg-accent/35"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            seek(((event.clientX - box.left) / box.width) * fullSeconds);
          }}
          role="presentation"
        >
          {removed.map((part) => (
            <span
              key={`${part.from}-${part.to}`}
              className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--err)_55%,transparent)_0_6px,transparent_6px_10px)] bg-surface-3"
              style={{ insetInlineStart: pct(part.from), inlineSize: `calc(${pct(part.to)} - ${pct(part.from)})` }}
            />
          ))}
          {cutFrom !== null ? (
            <span
              className="absolute inset-y-0 bg-[color-mix(in_oklab,var(--warn)_45%,transparent)]"
              style={{ insetInlineStart: pct(Math.min(cutFrom, now)), inlineSize: `calc(${pct(Math.max(cutFrom, now))} - ${pct(Math.min(cutFrom, now))})` }}
            />
          ) : null}
          <span className="absolute inset-y-0 w-0.5 bg-fg" style={{ insetInlineStart: pct(time) }} />
        </div>
        <div className="mono tabular flex justify-between text-[length:var(--fs-text-xs)] text-fg-muted">
          <span>0:00</span>
          <span className="font-semibold text-fg">{clock(time)}</span>
          <span>{clock(fullSeconds)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setStart(now)} className="chip">
          <SkipBack className="size-3.5" aria-hidden="true" /> {c.trimSetStart} <span dir="ltr" className="mono">{clock(now)}</span>
        </button>
        <button type="button" onClick={() => setEnd(now > 0 ? now : null)} className="chip">
          <SkipForward className="size-3.5" aria-hidden="true" /> {c.trimSetEnd} <span dir="ltr" className="mono">{clock(now)}</span>
        </button>
        {cutFrom === null ? (
          <button type="button" onClick={() => setCutFrom(now)} className="chip">
            <Scissors className="size-3.5" aria-hidden="true" /> {c.trimCutFrom}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (now !== cutFrom) setCuts((list) => [...list, { from: Math.min(cutFrom, now), to: Math.max(cutFrom, now) }]);
                setCutFrom(null);
              }}
              className="chip border-accent text-accent-text"
            >
              <Flag className="size-3.5" aria-hidden="true" /> {c.trimCutTo} <span dir="ltr" className="mono">{clock(now)}</span>
            </button>
            <button type="button" onClick={() => setCutFrom(null)} className="chip chip--quiet">
              {c.trimCutCancel}
            </button>
          </>
        )}
      </div>

      {trim.cuts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {trim.cuts.map((cut) => (
            <li
              key={`${cut.from}-${cut.to}`}
              className="flex items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pe-1 ps-3 text-[length:var(--fs-text-xs)] text-fg"
            >
              <button type="button" onClick={() => seek(cut.from)} className="hover:underline">
                {formatCopy(c.trimCutItem, { from: clock(cut.from), to: clock(cut.to) })}
              </button>
              <button
                type="button"
                aria-label={c.trimRemoveCut}
                title={c.trimRemoveCut}
                onClick={() => setCuts((list) => list.filter((item) => item !== cut && !(item.from === cut.from && item.to === cut.to)))}
                className="grid size-6 place-items-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={cn('text-[length:var(--fs-text-sm)]', problem !== null ? 'text-err' : 'text-fg-muted')}>
        {problem ?? formatCopy(c.trimResult, { after: clock(after), before: clock(fullSeconds) })}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || problem !== null}
          onClick={() => void save(whole ? null : trim)}
          className="chip border-accent bg-accent text-[#1A1206] disabled:opacity-50"
        >
          {c.trimSave}
        </button>
        {saved !== null || !whole ? (
          <button type="button" disabled={pending} onClick={() => void save(null)} className="chip chip--quiet">
            <Undo2 className="size-3.5" aria-hidden="true" /> {c.trimReset}
          </button>
        ) : null}
      </div>
    </div>
  );
}
