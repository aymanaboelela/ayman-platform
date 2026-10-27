'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, ListVideo } from 'lucide-react';
import { toast } from 'sonner';
import { montageCopy } from '@ayman/contracts/copy/montage';
import { formatCopy } from '@ayman/contracts/format';
import { MONTAGE_TITLE_MAX, type MontageTargets, type MontageVideo } from '@ayman/contracts/montage';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { cn } from '@ayman/ui/lib/cn';
import { montageApi, MontageRequestError } from '@/lib/montage-client';

const c = montageCopy;

type Mode = 'new' | 'existing';

/**
 * «حطه في درس» — course, then section, then a new lesson or one that is there.
 *
 * The targets are read when the dialog opens, not with the page: they are the
 * whole course tree, and most visits to «المونتاج» never open this.
 */
export function PublishDialog({
  video,
  onClose,
  onPublished,
}: {
  video: MontageVideo | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const router = useRouter();
  const [targets, setTargets] = useState<MontageTargets | null>(null);
  const [courseId, setCourseId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [mode, setMode] = useState<Mode>('new');
  const [title, setTitle] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [encrypt, setEncrypt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  if (video !== null && openFor !== video.id) {
    setOpenFor(video.id);
    setTitle(video.title.slice(0, MONTAGE_TITLE_MAX));
    setLessonId('');
    setMode('new');
  }

  useEffect(() => {
    if (video === null || targets !== null) return;
    let cancelled = false;
    montageApi
      .targets()
      .then((loaded) => {
        if (cancelled) return;
        setTargets(loaded);
        const first = loaded.courses[0];
        if (first !== undefined) {
          setCourseId(first.id);
          setSectionId(first.sections[0]?.id ?? '');
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(c.failed);
      });
    return () => {
      cancelled = true;
    };
  }, [video, targets]);

  const course = useMemo(() => targets?.courses.find((entry) => entry.id === courseId), [targets, courseId]);
  const section = course?.sections.find((entry) => entry.id === sectionId);
  const lesson = section?.lessons.find((entry) => entry.id === lessonId);

  const close = () => {
    setOpenFor(null);
    onClose();
  };

  const submit = async () => {
    if (video === null) return;
    setBusy(true);
    try {
      const result = await montageApi.publish(
        video.id,
        mode === 'new' ? { sectionId, title: title.trim(), encrypt } : { lessonId, encrypt },
      );
      toast.success(c.published, {
        action: { label: c.goToCourse, onClick: () => router.push(`/admin/courses/${result.courseId}`) },
      });
      setOpenFor(null);
      onPublished();
    } catch (error) {
      const detail = error instanceof MontageRequestError ? error.detail : null;
      toast.error(detail !== null && /[؀-ۿ]/.test(detail) ? detail : c.failed);
    } finally {
      setBusy(false);
    }
  };

  const ready =
    section !== undefined && (mode === 'new' ? title.trim().length >= 2 : lesson !== undefined) && !busy;

  return (
    <Dialog open={video !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent closeLabel={c.close} className="max-w-[36rem]">
        <DialogHeader>
          <DialogTitle>{formatCopy(c.publishTitle, { name: video?.title ?? '' })}</DialogTitle>
          <DialogDescription>{c.publishLead}</DialogDescription>
        </DialogHeader>

        {targets === null ? (
          <p className="py-6 text-center text-fg-muted">{c.loadingTargets}</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="montage-course">{c.course}</Label>
                <Select
                  id="montage-course"
                  value={courseId}
                  onChange={(event) => {
                    const next = targets.courses.find((entry) => entry.id === event.target.value);
                    setCourseId(event.target.value);
                    setSectionId(next?.sections[0]?.id ?? '');
                    setLessonId('');
                  }}
                >
                  {targets.courses.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="montage-section">{c.section}</Label>
                <Select
                  id="montage-section"
                  value={sectionId}
                  disabled={course === undefined || course.sections.length === 0}
                  onChange={(event) => {
                    setSectionId(event.target.value);
                    setLessonId('');
                  }}
                >
                  {course?.sections.length === 0 ? <option value="">{c.noSections}</option> : null}
                  {course?.sections.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div role="radiogroup" aria-label={c.lesson} className="grid gap-2 sm:grid-cols-2">
              {(['new', 'existing'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={mode === option}
                  onClick={() => setMode(option)}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border p-3 text-start transition-colors',
                    mode === option ? 'border-accent bg-surface-3' : 'border-line hover:bg-surface-3',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-lg',
                      option === 'new'
                        ? 'bg-[color-mix(in_oklab,var(--viz-3)_18%,var(--n-2))] text-[color:var(--viz-3)]'
                        : 'bg-[color-mix(in_oklab,var(--viz-2)_18%,var(--n-2))] text-[color:var(--viz-2)]',
                    )}
                  >
                    {option === 'new' ? <FilePlus2 className="size-4" /> : <ListVideo className="size-4" />}
                  </span>
                  <span>
                    <span className="block font-medium text-fg">{option === 'new' ? c.modeNew : c.modeExisting}</span>
                    <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
                      {option === 'new' ? c.modeNewHint : c.modeExistingHint}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {mode === 'new' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="montage-lesson-title">{c.lessonTitle}</Label>
                <Input
                  id="montage-lesson-title"
                  value={title}
                  maxLength={MONTAGE_TITLE_MAX}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
            ) : section !== undefined && section.lessons.length === 0 ? (
              <p className="rounded-lg bg-surface-3 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted">
                {c.noVideoLessons}
              </p>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="montage-lesson">{c.lesson}</Label>
                <Select id="montage-lesson" value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
                  <option value="">{c.pickLesson}</option>
                  {section?.lessons.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.hasVideo ? `${entry.title} — ${c.hasVideo}` : entry.title}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
              <input type="checkbox" checked={encrypt} onChange={(event) => setEncrypt(event.target.checked)} />
              {c.encrypt}
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={close}>
            {c.cancel}
          </Button>
          <Button onClick={() => void submit()} disabled={!ready}>
            {busy ? c.publishing : c.publishConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
