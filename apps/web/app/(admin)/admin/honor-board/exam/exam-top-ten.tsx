'use client';

import { useMemo, useState, useTransition } from 'react';
import { Camera, Crown, Medal, Sparkles, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  HONOR_PIN_MAX_RANK,
  type AdminHonorCandidate,
  type AdminHonorExamBoard,
} from '@ayman/contracts/admin/honor-board';
import { copy } from '@ayman/contracts/copy/admin';
import { copy as siteCopy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { MediaKeyField } from '@/components/admin/media-key-field';
import { HonorFaceThumb } from '../honor-face-thumb';
import { publishHonorExamAction } from '../actions';

const c = copy.admin.honorBoard;
const RANKS = siteCopy.landing.honorBoard.placeRanks;
const PLACES = Array.from({ length: HONOR_PIN_MAX_RANK }, (_, index) => index + 1);

/** Same Cairo-day formatter the pin dialog defaults its date with. */
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

/** Gold, silver, bronze — then the accent for 4..10. Utility classes only,
 *  every colour from the token layer or a fixed medal hue. */
const PLACE_TONE: Record<number, string> = {
  1: 'bg-[oklch(0.82_0.15_85)] text-[oklch(0.30_0.07_70)]',
  2: 'bg-[oklch(0.82_0.02_250)] text-[oklch(0.30_0.03_250)]',
  3: 'bg-[oklch(0.72_0.11_55)] text-[oklch(0.28_0.07_50)]',
};
const toneFor = (rank: number) => PLACE_TONE[rank] ?? 'bg-accent text-[color:var(--on-accent-ink)]';

/**
 * «حدد مين الأول» — the ranking form for one month exam.
 *
 * ## The rank is a select per row, and picking a taken place SWAPS
 *
 * Ten places, forty papers. A select on every row is the one control that
 * works the same on a phone and a desk. Choosing «المركز التاني» for a
 * student while someone else holds it hands that someone this student's old
 * place (or none) — so the board is never in a state with two seconds, and
 * there is no error to show.
 *
 * ## Nothing is saved until «انشر الأوائل»
 *
 * The whole ten go in one PUT. Saving per row would notify a student the
 * moment he picked them, then take it back when he reshuffled.
 */
export function ExamTopTen({ board }: { board: AdminHonorExamBoard }) {
  const initial = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of board.candidates) if (row.pinnedRank !== null) map.set(row.attemptId, row.pinnedRank);
    return map;
  }, [board.candidates]);

  const [ranks, setRanks] = useState<Map<string, number>>(initial);
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map());
  const [day, setDay] = useState(board.day ?? dayKey.format(new Date()));
  const [photoFor, setPhotoFor] = useState<AdminHonorCandidate | null>(null);
  const [pending, start] = useTransition();

  const byAttempt = useMemo(
    () => new Map(board.candidates.map((row) => [row.attemptId, row])),
    [board.candidates],
  );
  const holder = useMemo(() => {
    const map = new Map<number, string>();
    for (const [attemptId, rank] of ranks) map.set(rank, attemptId);
    return map;
  }, [ranks]);

  const photoOf = (row: AdminHonorCandidate) =>
    photos.has(row.attemptId) ? (photos.get(row.attemptId) ?? null) : row.photoKey;

  function assign(attemptId: string, rank: number | null) {
    setRanks((current) => {
      const next = new Map(current);
      const previous = next.get(attemptId) ?? null;
      next.delete(attemptId);
      if (rank !== null) {
        const other = holder.get(rank);
        if (other && other !== attemptId) {
          next.delete(other);
          if (previous !== null) next.set(other, previous);
        }
        next.set(attemptId, rank);
      }
      return next;
    });
  }

  /** The first ten as listed — the grading screen's own «الأوائل» order. */
  function autoFill() {
    setRanks(new Map(board.candidates.slice(0, HONOR_PIN_MAX_RANK).map((row, index) => [row.attemptId, index + 1])));
  }

  function publish() {
    const picks = [...ranks.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([attemptId, rank]) => ({
        attemptId,
        rank,
        ...(photos.has(attemptId) ? { photoKey: photos.get(attemptId) ?? null } : {}),
      }));
    start(async () => {
      const result = await publishHonorExamAction(board.lessonId, { day, picks });
      if (result.ok) {
        toast.success(
          formatCopy(c.published, { added: result.added, updated: result.updated, removed: result.removed }),
        );
        setPhotos(new Map());
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* The ten places, filled live — what the public podium will carry. */}
      <section className="rounded-[var(--r-lg)] border border-[color-mix(in_oklab,oklch(0.82_0.15_85)_45%,transparent)] bg-[linear-gradient(135deg,color-mix(in_oklab,oklch(0.82_0.15_85)_16%,var(--n-1)),var(--n-1))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[length:var(--fs-text-base)] font-semibold text-fg">
            <Sparkles className="size-5 text-accent" aria-hidden="true" />
            {c.podiumPreview}
            <span dir="ltr" className="rounded-full bg-accent/15 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-accent-text">
              {formatCopy(c.pickedCount, { n: ranks.size })}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={autoFill}>
              <Star className="size-4" aria-hidden="true" />
              {c.autoFill}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRanks(new Map())} disabled={ranks.size === 0}>
              <X className="size-4" aria-hidden="true" />
              {c.clearAll}
            </Button>
          </div>
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PLACES.map((place) => {
            const attemptId = holder.get(place);
            const row = attemptId ? byAttempt.get(attemptId) : undefined;
            return (
              <li
                key={place}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border p-2',
                  row ? 'border-line bg-surface-1' : 'border-dashed border-line-strong',
                )}
              >
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[length:var(--fs-text-sm)] font-bold', toneFor(place))}>
                  {place === 1 ? <Crown className="size-4" aria-hidden="true" /> : place}
                </span>
                {row ? (
                  <>
                    <HonorFaceThumb name={row.studentName} photoKey={photoOf(row)} />
                    <span className="min-w-0 truncate text-[length:var(--fs-text-sm)] font-semibold text-fg">
                      {row.studentName}
                    </span>
                  </>
                ) : (
                  <span className="truncate text-[length:var(--fs-text-xs)] text-fg-subtle">{RANKS[place - 1]}</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-[var(--r-lg)] border border-line bg-surface-1">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-[length:var(--fs-text-base)] font-semibold text-fg">{c.candidatesTitle}</h2>
          <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">{c.candidatesHint}</p>
        </header>
        {board.candidates.length === 0 ? (
          <p className="p-6 text-center text-[length:var(--fs-text-sm)] text-fg-muted">{c.candidatesEmpty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {board.candidates.map((row, index) => {
              const rank = ranks.get(row.attemptId) ?? null;
              return (
                <li
                  key={row.attemptId}
                  className={cn(
                    'flex flex-wrap items-center gap-3 px-4 py-3 transition-colors',
                    rank !== null && 'bg-[color-mix(in_oklab,var(--a-9)_8%,var(--n-1))]',
                  )}
                >
                  <span className="w-6 shrink-0 text-center text-[length:var(--fs-text-xs)] text-fg-subtle" dir="ltr">
                    {index + 1}
                  </span>
                  <HonorFaceThumb name={row.studentName} photoKey={photoOf(row)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:var(--fs-text-base)] font-semibold text-fg">{row.studentName}</p>
                    <p className="flex flex-wrap items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
                      {row.scaledScore !== null ? (
                        <span dir="ltr" className="inline-block rounded-full bg-[color-mix(in_oklab,var(--ok)_15%,transparent)] px-2 text-fg">
                          {round2(row.scaledScore)}/{round2(row.gradeOutOf)}
                          {row.percent !== null ? ` · ${row.percent}%` : ''}
                        </span>
                      ) : null}
                      {row.instructorRating !== null ? (
                        <span className="inline-flex items-center gap-0.5 text-accent-text" dir="ltr">
                          <Star className="size-3.5 fill-current" aria-hidden="true" />
                          {row.instructorRating}
                        </span>
                      ) : null}
                      {row.phone ? <span dir="ltr" className="text-fg-subtle">{row.phone}</span> : null}
                    </p>
                  </div>
                  <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPhotoFor(row)}>
                      <Camera className="size-4" aria-hidden="true" />
                      {c.photo}
                    </Button>
                    {rank !== null ? (
                      <span className={cn('grid size-8 place-items-center rounded-full text-[length:var(--fs-text-sm)] font-bold', toneFor(rank))} aria-hidden="true">
                        {rank <= 3 ? <Medal className="size-4" /> : rank}
                      </span>
                    ) : null}
                    <Select
                      aria-label={formatCopy(c.rankFor, { name: row.studentName })}
                      value={rank === null ? '' : String(rank)}
                      onChange={(event) => assign(row.attemptId, event.target.value === '' ? null : Number(event.target.value))}
                      className="w-40"
                    >
                      <option value="">{c.rankNone}</option>
                      {PLACES.map((place) => (
                        <option key={place} value={place}>
                          {RANKS[place - 1]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The publish bar stays in reach on a long list. */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-end justify-between gap-3 rounded-[var(--r-lg)] border border-line bg-surface-2 p-3 shadow-lg">
        <div className="space-y-1">
          <Label htmlFor="honor-exam-day">{c.dayLabel}</Label>
          <Input id="honor-exam-day" type="date" value={day} onChange={(event) => setDay(event.target.value)} className="w-44" />
        </div>
        <div className="flex flex-col items-end gap-1">
          {ranks.size === 0 && initial.size > 0 ? (
            <span className="text-[length:var(--fs-text-xs)] text-[color:var(--warn)]">{c.publishEmpty}</span>
          ) : null}
          <Button type="button" onClick={publish} disabled={pending || !day || (ranks.size === 0 && initial.size === 0)}>
            <Crown className="size-4" aria-hidden="true" />
            {pending ? c.publishing : c.publish}
          </Button>
        </div>
      </div>

      <Dialog open={photoFor !== null} onOpenChange={(open) => (open ? null : setPhotoFor(null))}>
        <DialogContent closeLabel={copy.admin.common.cancel}>
          {photoFor ? (
            <>
              <DialogHeader>
                <DialogTitle>{formatCopy(c.photoTitle, { name: photoFor.studentName })}</DialogTitle>
              </DialogHeader>
              <MediaKeyField
                key={photoFor.attemptId}
                name="photoKey"
                id="honor-exam-photo"
                label={c.photo}
                hint={c.examPhotoHint}
                shape="round"
                defaultValue={photoOf(photoFor)}
                onChange={(key) =>
                  setPhotos((current) => new Map(current).set(photoFor.attemptId, key))
                }
              />
              <DialogFooter>
                <Button type="button" onClick={() => setPhotoFor(null)}>
                  {c.photoDone}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function round2(value: number): string {
  return String(Math.round(value * 100) / 100);
}
