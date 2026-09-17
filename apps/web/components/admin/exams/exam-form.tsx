'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import type { ExamLessonPicker } from '@ayman/contracts/admin/exams';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { createExamAction, loadExamLessonsAction, patchExamAction } from '@/app/(admin)/admin/exams/actions';
import { CoveragePicker } from './coverage-picker';
import { examFailureMessage, type ExamFailure } from './exam-errors';
import { toLocalInputValue } from './exam-time';
import { WindowEcho } from './window-echo';

const c = copy.admin.monthlyExams;

export interface ExamCourseOption {
  id: string;
  title: string;
}

/** What the edit screen already knows. Absent on create. */
export interface ExamFormInitial {
  lessonId: string;
  courseId: string;
  title: string;
  coveredLessonIds: string[];
  /** ISO instants off the row; `null` only on an exam whose quiz is missing. */
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number | null;
  gradeOutOf: number;
  passPercent: number;
}

export interface ExamFormProps {
  courses: readonly ExamCourseOption[];
  /**
   * On EDIT this is the exam's own course, already fetched server-side — so the
   * syllabus he is looking at is on screen in the first paint rather than after
   * a round trip. On CREATE it is empty until he picks a course.
   */
  initialSections?: ExamLessonPicker['sections'];
  initial?: ExamFormInitial;
}

/** The one place a numeric field's string becomes a number. Empty and junk both
 *  answer `null`, so «مطلوب» is what shows rather than a NaN reaching the API. */
function num(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * «امتحان جديد» / «تعديل الامتحان» — one form, both jobs.
 *
 * ## Why this screen exists at all
 *
 * `LESSON_KINDS` in the course editor's lesson panel is
 * `['video','text','attachment']` on purpose, and must stay that way: a
 * standalone quiz in the outline was counted as a lecture, numbered as one, and
 * could shut the rest of the course behind one failed sitting. So there is NO
 * path through the course editor that can author a monthly exam. This form is
 * the only door.
 *
 * ## One submit, four objects
 *
 * The API's `create` writes the course's «امتحانات الشهر» shelf (on first use),
 * the exam's `Lesson(kind:'quiz')`, its `Quiz` carrying the window and the
 * timer, and its coverage rows — in one transaction. Nothing here has to
 * sequence those, and nothing here may try.
 *
 * The result arrives as a DRAFT, deliberately: an exam with no questions in it
 * must not be able to reach a student. Publishing is its own act on the list,
 * behind its own preflight, which is why this form has no publish switch.
 *
 * ## `courseId` is not editable
 *
 * Moving an exam between courses would strand its coverage rows against the
 * composite FKs — `AdminExamPatchSchema` has no `courseId` key at all. The
 * honest answer is to delete it and make another, so on edit the course is a
 * fact printed at the top rather than a control that looks like it works.
 */
export function ExamForm({ courses, initialSections = [], initial }: ExamFormProps) {
  const router = useRouter();
  const isEdit = initial !== undefined;

  const [courseId, setCourseId] = useState(initial?.courseId ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [sections, setSections] = useState<ExamLessonPicker['sections']>(initialSections);
  const [loadingLessons, startLoadingLessons] = useTransition();
  const [covered, setCovered] = useState<string[]>(initial?.coveredLessonIds ?? []);

  /*
   * `datetime-local` strings, not `Date`s, because that is what the control
   * holds — `toLocalInputValue` is `quiz-settings-form.tsx`'s own round-trip
   * (see `exam-time.ts`), used here for the same two columns it writes.
   */
  const [opensAt, setOpensAt] = useState(
    initial?.opensAt ? toLocalInputValue(new Date(initial.opensAt)) : '',
  );
  const [closesAt, setClosesAt] = useState(
    initial?.closesAt ? toLocalInputValue(new Date(initial.closesAt)) : '',
  );

  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 60));
  const [gradeOutOf, setGradeOutOf] = useState(String(initial?.gradeOutOf ?? 100));
  const [passPercent, setPassPercent] = useState(String(initial?.passPercent ?? 70));

  const [saving, setSaving] = useState(false);
  /** The failure the API named, rendered on the control it belongs to. */
  const [failure, setFailure] = useState<ExamFailure | null>(null);
  /** Fields the form itself refused to send. Keyed by control id. */
  const [missing, setMissing] = useState<Set<string>>(new Set());

  function pickCourse(id: string) {
    setCourseId(id);
    // Everything downstream belonged to the previous course — a coverage row
    // naming another course's lesson is a 23503 against the composite FK, not a
    // silent miswrite, but it is still a form that submits and fails.
    setSections([]);
    setCovered([]);
    if (id === '') return;

    startLoadingLessons(async () => {
      const result = await loadExamLessonsAction(id);
      if (!result.ok) {
        toast.error(c.saveFailed);
        return;
      }
      setSections(result.sections);
    });
  }

  /** Everything the API would refuse anyway, checked here so the answer lands
   *  on the field instead of arriving as one flat «مقدرناش نحفظ». */
  function validate(): Set<string> {
    const bad = new Set<string>();
    if (!isEdit && courseId === '') bad.add('exam-course');
    if (title.trim().length < 3) bad.add('exam-title');
    if (covered.length === 0) bad.add('exam-coverage');
    if (opensAt === '') bad.add('exam-opens');
    if (closesAt === '') bad.add('exam-closes');

    const minutes = num(duration);
    if (minutes === null || minutes < 1 || minutes > 480) bad.add('exam-duration');
    const outOf = num(gradeOutOf);
    if (outOf === null || outOf < 1 || outOf > 1000) bad.add('exam-grade');
    const pass = num(passPercent);
    if (pass === null || pass < 0 || pass > 100) bad.add('exam-pass');
    return bad;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    const bad = validate();
    setMissing(bad);
    if (bad.size > 0) return;

    /*
     * The window, checked HERE as well as server-side.
     *
     * `exam_window_inverted` is one of the five refusals whose code the API
     * cannot currently deliver (see `exam-errors.ts`), and it is also the one
     * mistake he is most likely to make at speed — «يقفل» left on the same
     * hour as «يفتح». Catching it in the browser means it reads as a field
     * error on the closing input rather than as a failed save.
     */
    const from = new Date(opensAt);
    const until = new Date(closesAt);
    if (!(until > from)) {
      setFailure('window_inverted');
      setMissing(new Set(['exam-closes']));
      return;
    }

    const body = {
      title: title.trim(),
      coveredLessonIds: covered,
      opensAt: from.toISOString(),
      closesAt: until.toISOString(),
      durationMinutes: num(duration),
      gradeOutOf: num(gradeOutOf),
      passPercent: num(passPercent),
    };

    setSaving(true);
    const result = isEdit
      ? await patchExamAction(initial.lessonId, body)
      : await createExamAction({ ...body, courseId });
    setSaving(false);

    if (!result.ok) {
      setFailure(result.failure);
      toast.error(examFailureMessage(result.failure));
      return;
    }

    toast.success(c.saved);
    // Back to the cross-course list either way: it is the screen that answers
    // «إيه الجاي؟», and on create it is also where «حط الأسئلة» lives — the
    // only useful next step on an exam that is still an empty paper.
    router.push('/admin/exams');
    router.refresh();
  }

  const windowError = failure === 'window_inverted';

  /*
   * `method="post"` is not decoration. The markup is in the SSR'd HTML long
   * before React attaches `onSubmit`, and a form with no method submits as
   * GET — so a press inside that window reloads the page with every field in
   * the query string. `form-method.test.ts` enforces it on every form in this
   * app after a real sign-in put a password there.
   */
  return (
    <form method="post" onSubmit={submit} className="mt-6 flex max-w-[var(--w-prose)] flex-col gap-5">
      {/* The whole-form banner is for the failures that belong to no single
          field. A window error is rendered on «يقفل» instead, so it is not
          repeated up here. */}
      {failure !== null && !windowError ? (
        <p
          role="alert"
          className="rounded-sm border border-err bg-surface-2 p-3 text-[length:var(--fs-text-sm)] text-err"
        >
          {examFailureMessage(failure)}
        </p>
      ) : null}

      <div>
        <Label htmlFor="exam-course">{c.courseLabel}</Label>
        {isEdit ? (
          /* Stated, not offered — `AdminExamPatchSchema` has no `courseId`. */
          <p className="mt-1 text-[length:var(--fs-text-base)] text-fg">
            {courses.find((course) => course.id === initial.courseId)?.title ?? initial.courseId}
          </p>
        ) : (
          <>
            <Select
              id="exam-course"
              value={courseId}
              invalid={missing.has('exam-course')}
              onChange={(event) => pickCourse(event.target.value)}
            >
              <option value="">—</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
            {missing.has('exam-course') ? <FieldError /> : null}
          </>
        )}
      </div>

      <div>
        <Label htmlFor="exam-title">{c.titleLabel}</Label>
        <Input
          id="exam-title"
          value={title}
          placeholder={c.titlePlaceholder}
          invalid={missing.has('exam-title')}
          onChange={(event) => setTitle(event.target.value)}
        />
        {missing.has('exam-title') ? <FieldError /> : null}
      </div>

      <div>
        <Label htmlFor="exam-coverage">{c.coverageLabel}</Label>
        <p id="exam-coverage" className="mb-2 text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.coverageHint}
        </p>
        <CoveragePicker
          idPrefix="exam-cover"
          sections={sections}
          selected={covered}
          onChange={setCovered}
          loading={loadingLessons}
        />
        {missing.has('exam-coverage') ? <FieldError /> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="exam-opens">{c.opensAtLabel}</Label>
          <Input
            id="exam-opens"
            type="datetime-local"
            value={opensAt}
            invalid={missing.has('exam-opens')}
            onChange={(event) => setOpensAt(event.target.value)}
          />
          <WindowEcho value={opensAt} />
          {missing.has('exam-opens') ? <FieldError /> : null}
        </div>

        <div>
          <Label htmlFor="exam-closes">{c.closesAtLabel}</Label>
          <Input
            id="exam-closes"
            type="datetime-local"
            value={closesAt}
            invalid={missing.has('exam-closes')}
            onChange={(event) => setClosesAt(event.target.value)}
          />
          <WindowEcho value={closesAt} />
          {windowError ? (
            <p role="alert" className="mt-1 text-[length:var(--fs-text-xs)] text-err">
              {examFailureMessage('window_inverted')}
            </p>
          ) : null}
          {missing.has('exam-closes') && !windowError ? <FieldError /> : null}
        </div>

        <div>
          <Label htmlFor="exam-duration">{c.durationLabel}</Label>
          <Input
            id="exam-duration"
            type="number"
            min={1}
            max={480}
            inputMode="numeric"
            value={duration}
            invalid={missing.has('exam-duration')}
            onChange={(event) => setDuration(event.target.value)}
          />
          {missing.has('exam-duration') ? <FieldError /> : null}
        </div>

        <div>
          <Label htmlFor="exam-grade">{c.gradeOutOfLabel}</Label>
          <Input
            id="exam-grade"
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={gradeOutOf}
            invalid={missing.has('exam-grade')}
            onChange={(event) => setGradeOutOf(event.target.value)}
          />
          {missing.has('exam-grade') ? <FieldError /> : null}
        </div>

        <div>
          <Label htmlFor="exam-pass">{c.passPercentLabel}</Label>
          <Input
            id="exam-pass"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={passPercent}
            invalid={missing.has('exam-pass')}
            onChange={(event) => setPassPercent(event.target.value)}
          />
          {missing.has('exam-pass') ? <FieldError /> : null}
        </div>
      </div>

      <div>
        <Button type="submit" disabled={saving}>
          {c.save}
        </Button>
      </div>
    </form>
  );
}

/** One shared «الحقل ده مطلوب». Six private copies is how one of them ends up
 *  without `role="alert"` — the same reason `ActionError` was extracted. */
function FieldError() {
  return (
    <p role="alert" className="mt-1 text-[length:var(--fs-text-xs)] text-err">
      {copy.admin.common.required}
    </p>
  );
}
