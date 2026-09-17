'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import type { ExamLessonPicker } from '@ayman/contracts/admin/exams';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { duplicateExamAction, loadExamLessonsAction } from '@/app/(admin)/admin/exams/actions';
import { CoveragePicker } from './coverage-picker';
import { examFailureMessage } from './exam-errors';
import type { ExamCourseOption } from './exam-form';

const c = copy.admin.monthlyExams;

/** The API caps a duplicate at ten targets in one call. */
const MAX_TARGETS = 10;

interface TargetDraft {
  sections: ExamLessonPicker['sections'];
  covered: string[];
  /** Empty means "keep the source exam's title", which is what the API does. */
  title: string;
}

/**
 * «كرر الامتحان ده على باقي الكورسات».
 *
 * ## Why this is a button and not a database constraint
 *
 * His rhythm is four courses, one per part, twice a month. One design proposed
 * expressing that as `UNIQUE(year, month, slot)` — which would refuse him a
 * make-up paper at 19:45 with a 23505 he cannot route around. So the rhythm
 * lives here, as an action he takes, and the schema stays permissive.
 *
 * ## Why each target names its OWN lessons
 *
 * The four parts do not line up: «الوحدة الثانية» in one course is not the same
 * week's material as in another, and the covered lessons are what the student
 * reads as «ذاكر إيه». Copying the source's list across would print a syllabus
 * that is wrong for three courses out of four. So a course only becomes a
 * target once at least one of ITS lessons is ticked, and a course left
 * untouched is simply not in the request.
 *
 * The window, the duration and the marks ARE copied — those are the same
 * decision for every part. The QUESTIONS are not: each paper is his to write,
 * which is why the list's «حط الأسئلة» is the next step on each new row.
 *
 * ## Lessons load per course, on expand
 *
 * Twelve courses is twelve requests if the dialog fetches eagerly, on a screen
 * where he usually duplicates onto three. `startTransition` per course keeps
 * each one's spinner local to its own block.
 */
export function DuplicateExamDialog({
  lessonId,
  sourceTitle,
  courses,
}: {
  lessonId: string;
  sourceTitle: string;
  /** Every course EXCEPT the source's — an exam duplicated onto its own course
   *  would be a second, identical paper on the same shelf. */
  courses: readonly ExamCourseOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>({});
  const [loading, startLoading] = useTransition();
  const [saving, setSaving] = useState(false);

  const targets = Object.entries(drafts)
    .filter(([, draft]) => draft.covered.length > 0)
    .map(([courseId, draft]) => ({
      courseId,
      coveredLessonIds: draft.covered,
      ...(draft.title.trim().length >= 3 ? { title: draft.title.trim() } : {}),
    }));

  function toggleCourse(courseId: string) {
    if (expanded === courseId) {
      setExpanded(null);
      return;
    }
    setExpanded(courseId);
    if (drafts[courseId]) return;

    startLoading(async () => {
      const result = await loadExamLessonsAction(courseId);
      if (!result.ok) {
        toast.error(c.saveFailed);
        return;
      }
      setDrafts((current) => ({
        ...current,
        [courseId]: { sections: result.sections, covered: [], title: '' },
      }));
    });
  }

  function patchDraft(courseId: string, patch: Partial<TargetDraft>) {
    setDrafts((current) => {
      const existing = current[courseId];
      if (!existing) return current;
      return { ...current, [courseId]: { ...existing, ...patch } };
    });
  }

  async function submit() {
    if (targets.length === 0) return;
    setSaving(true);
    const result = await duplicateExamAction(lessonId, { targets: targets.slice(0, MAX_TARGETS) });
    setSaving(false);

    if (!result.ok) {
      toast.error(examFailureMessage(result.failure));
      return;
    }
    toast.success(c.saved);
    setOpen(false);
    setExpanded(null);
    setDrafts({});
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setExpanded(null);
          setDrafts({});
        }
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="chip chip--quiet">
          <Copy className="size-3.5" aria-hidden="true" />
          {c.duplicate}
        </button>
      </DialogTrigger>

      <DialogContent closeLabel={copy.admin.common.close} className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{c.duplicate}</DialogTitle>
          {/* The source's title, so a dialog opened from the wrong row is
              obvious before ten courses get a paper they did not ask for. */}
          <DialogDescription>{sourceTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {courses.map((course) => {
            const draft = drafts[course.id];
            const isOpen = expanded === course.id;
            const picked = draft?.covered.length ?? 0;

            return (
              <div
                key={course.id}
                className={cn(
                  'rounded-lg border bg-surface-2',
                  picked > 0 ? 'border-accent/50' : 'border-line-subtle',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleCourse(course.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 p-3 text-start text-[length:var(--fs-text-sm)] text-fg"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('size-4 shrink-0 text-fg-faint', isOpen && 'rotate-180')}
                  />
                  <span className="min-w-0 flex-1 truncate">{course.title}</span>
                  {picked > 0 ? (
                    <span className="mono shrink-0 text-[length:var(--fs-mono-label)] text-accent-text tabular-nums">
                      {picked}
                    </span>
                  ) : null}
                </button>

                {isOpen ? (
                  <div className="flex flex-col gap-3 border-t border-line-subtle p-3">
                    <CoveragePicker
                      idPrefix={`dup-${course.id}`}
                      sections={draft?.sections ?? []}
                      selected={draft?.covered ?? []}
                      onChange={(next) => patchDraft(course.id, { covered: next })}
                      loading={loading && !draft}
                    />

                    <div>
                      <Label htmlFor={`dup-title-${course.id}`}>{c.titleLabel}</Label>
                      <Input
                        id={`dup-title-${course.id}`}
                        value={draft?.title ?? ''}
                        // Blank keeps the source's name, which is the usual
                        // case — the same exam, on four parts, in one week.
                        placeholder={sourceTitle}
                        disabled={!draft}
                        onChange={(event) => patchDraft(course.id, { title: event.target.value })}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => void submit()} disabled={saving || targets.length === 0}>
            {c.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
