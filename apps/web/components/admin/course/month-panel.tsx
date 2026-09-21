'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { AdminCourseMonth } from '@ayman/contracts/months';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import {
  createMonthAction,
  deleteMonthAction,
  updateMonthAction,
} from '@/app/(admin)/admin/courses/actions';
import type { AdminCourseDetail } from '@/app/(admin)/admin/courses/[id]/page';
import { ConfirmButton } from './confirm-button';
import { InlineTitle } from './inline-title';

const c = copy.admin.month;

type Section = AdminCourseDetail['sections'][number];
type Lesson = Section['lessons'][number];

/**
 * الشهور المضبوطة على الكورس ده، لأي كومبوننت `'use client'` جوّه المحرّر.
 *
 * ## ليه كونتكست ومش prop
 *
 * نفس سبب `entitlements-context.tsx` بالظبط: كنترول «الشهر» قاعد في
 * `lesson-panel.tsx`، وده على عمق خمس كومبوننتات من `course-editor.tsx` —
 * `SectionList` → `SectionCard` → `SortableLessonList` → `LessonCard` →
 * `LessonPanel` — وكلهم `'use client'`. تمرير الليستة في الخمسة دول معناه إن
 * أي كومبوننت جديد بينسى يستلمها **بيرسم الكنترول فاضي**، والكنترول ده لما
 * يفضل فاضي على محاضرة متحطّة في شهر، أول حفظ بيشيلها من الشهر اللي حد دفع
 * فيه.
 *
 * `[]` معناها «الكورس ده مابيتباعش بالشهور» — وساعتها الكنترول مابيترسمش أصلًا.
 */
const CourseMonthsContext = createContext<AdminCourseMonth[]>([]);

export function CourseMonthsProvider({
  months,
  children,
}: {
  months: AdminCourseMonth[];
  children: ReactNode;
}) {
  return <CourseMonthsContext.Provider value={months}>{children}</CourseMonthsContext.Provider>;
}

/**
 * الشهور، أو ليستة فاضية.
 *
 * مابيرميش من غير provider — على عكس `useFeature` — لأن الافتراضي هنا مالوش
 * أي خطر: «مفيش شهور» بيخفي كنترول، وهو نفس اللي كل كورس مالوش شهور بيعمله.
 */
export function useCourseMonths(): AdminCourseMonth[] {
  return useContext(CourseMonthsContext);
}

/** 1..12 — the DB CHECK's own range, and the reason there is a ceiling at all:
 *  nine is the school year and a revision or summer month is a real thing he
 *  asks for. */
const MONTH_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** The first month number this course has not used yet, so adding the fourth
 *  month is one field to type instead of two. `12` when they are all taken —
 *  the create then fails on the DB's own unique index, with the sentence the
 *  API already writes for a duplicate. */
function nextFreeIndex(months: AdminCourseMonth[]): number {
  const taken = new Set(months.map((month) => month.monthIndex));
  return MONTH_INDEXES.find((index) => !taken.has(index)) ?? 12;
}

/**
 * Published LECTURES carrying no month — quizzes excluded.
 *
 * The same definition `CourseMonthService.PUBLISHED_LECTURE` counts with, and
 * it has to stay the same: this list is what the instructor works through to
 * make the API's own count reach zero, and a list that disagrees with the
 * number above it is a list that can never be finished.
 */
function untaggedLessons(sections: Section[]): { section: Section; lesson: Lesson }[] {
  return sections.flatMap((section) =>
    section.lessons
      .filter((lesson) => lesson.isPublished && lesson.kind !== 'quiz' && lesson.months.length === 0)
      .map((lesson) => ({ section, lesson })),
  );
}

/**
 * The refusal, standing.
 *
 * Not a toast and not a state set by the last failed press: while the course
 * has an untagged published lecture, NO month can go on sale, so this is a
 * property of the course and it is on screen until it is fixed. The number
 * comes from the month rows — `untaggedLessonCount` is repeated on every one
 * of them precisely so the admin reads it where the refusal happens.
 *
 * «ورّيني المحاضرات دي» opens the list in place rather than navigating: the
 * lectures are on this same page, in the outline below, and sending him to
 * another screen to read names he then has to come back and act on is how a
 * fixable state stays unfixed.
 */
function UntaggedNotice({ count, sections }: { count: number; sections: Section[] }) {
  const [open, setOpen] = useState(false);
  const untagged = untaggedLessons(sections);

  return (
    <div className="mb-3 rounded-sm border border-line bg-surface-2 p-3">
      <p className="text-[length:var(--fs-text-sm)] text-err">
        {formatCopy(c.blockedByUntagged, { n: count })}
      </p>
      <button
        type="button"
        className="mt-1 text-[length:var(--fs-text-sm)] underline"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {c.untaggedLink}
      </button>
      {open ? (
        <ul className="mt-2 space-y-0.5">
          {untagged.map(({ section, lesson }) => (
            <li key={lesson.id} className="text-[length:var(--fs-text-xs)] text-fg-muted">
              {section.title} — <span className="text-fg">{lesson.title}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The month's number. Committed on blur like every other field in this
 *  editor, and reverted when it is not 1..12 — the DB CHECK refuses anything
 *  else and a 400 the instructor cannot read is worse than a field that snaps
 *  back. */
function MonthIndexField({ courseId, month }: { courseId: string; month: AdminCourseMonth }) {
  const router = useRouter();
  const [draft, setDraft] = useState(String(month.monthIndex));
  const [pending, setPending] = useState(false);

  async function commit() {
    const monthIndex = Number(draft);
    if (
      !Number.isInteger(monthIndex) ||
      monthIndex < 1 ||
      monthIndex > 12 ||
      monthIndex === month.monthIndex
    ) {
      setDraft(String(month.monthIndex));
      return;
    }
    setPending(true);
    const result = await updateMonthAction(courseId, month.id, { monthIndex });
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      router.refresh();
    } else {
      // Almost always «الشهر ده موجود بالفعل» — two months cannot share a
      // number on one course. The old value comes back so the row still names
      // the month it is.
      toast.error(result.message);
      setDraft(String(month.monthIndex));
    }
  }

  return (
    <Input
      type="number"
      min={1}
      max={12}
      inputMode="numeric"
      dir="ltr"
      aria-label={c.indexLabel}
      value={draft}
      disabled={pending}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      className="w-16"
    />
  );
}

/** «بيبدأ في» — a date that decides nothing. It orders and it displays; no
 *  gate anywhere reads it, which is why clearing it is a legal edit and not a
 *  warning. */
function MonthStartsOnField({ courseId, month }: { courseId: string; month: AdminCourseMonth }) {
  const router = useRouter();
  const [draft, setDraft] = useState(month.startsOn ?? '');
  const [pending, setPending] = useState(false);

  async function commit() {
    const startsOn = draft === '' ? null : draft;
    if (startsOn === month.startsOn) return;
    setPending(true);
    const result = await updateMonthAction(courseId, month.id, { startsOn });
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      router.refresh();
    } else {
      toast.error(result.message);
      setDraft(month.startsOn ?? '');
    }
  }

  return (
    <Input
      type="date"
      dir="ltr"
      aria-label={c.startsOnLabel}
      value={draft}
      disabled={pending}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      className="w-40"
    />
  );
}

function MonthRow({ courseId, month }: { courseId: string; month: AdminCourseMonth }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  /**
   * ⚠️ Closing revokes NOTHING, unlike the term switch next door.
   *
   * `TermService.setOpen` bulk-revokes every live grant behind the term, which
   * is why `TermRow` reports a number afterwards. A month's switch only takes
   * it off the shelf: everyone holding it keeps it, forever, because a month
   * grant has no expiry at all. So there is no count to report and no
   * confirmation to ask for — he will close and reopen a month nine times a
   * year.
   */
  async function toggle(nextOpen: boolean) {
    setPending(true);
    const result = await updateMonthAction(courseId, month.id, { isOpen: nextOpen });
    setPending(false);
    if (!result.ok) {
      // The untagged refusal already has a standing notice above the list, so
      // the toast's only job is to connect it to the switch that was pressed.
      toast.error(
        result.untaggedLessonCount === undefined
          ? result.message
          : formatCopy(c.blockedByUntagged, {
              n: result.untaggedLessonCount || month.untaggedLessonCount,
            }),
      );
      // The count on the rows may be the reason, and it may be stale — a
      // lecture published in another tab. Re-reading is what makes the notice
      // above agree with the refusal.
      router.refresh();
      return;
    }
    toast.success(copy.admin.common.saved);
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line-subtle bg-surface-2 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <MonthIndexField courseId={courseId} month={month} />
        <InlineTitle
          value={month.title}
          label={c.titleLabel}
          onSave={async (title) => {
            const result = await updateMonthAction(courseId, month.id, { title });
            if (result.ok) router.refresh();
            return result;
          }}
        />
        <MonthStartsOnField courseId={courseId} month={month} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* The two numbers he asked to see. «لسه من غير محاضرات» and «لسه محدش
            مشترك» are their own sentences rather than a «٠»: a zero reads as a
            measurement that failed, and both of these are ordinary states a
            month sits in for weeks. */}
        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {month.lessonCount === 0 ? c.lessonsNone : formatCopy(c.lessons, { n: month.lessonCount })}
        </span>
        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {month.subscriberCount === 0
            ? c.subscribersNone
            : formatCopy(c.subscribers, { n: month.subscriberCount })}
        </span>
        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {month.isOpen ? c.open : c.closed}
        </span>
        <Switch
          checked={month.isOpen}
          disabled={pending}
          onCheckedChange={(checked) => void toggle(checked)}
          aria-label={c.toggleLabel}
        />

        <span aria-hidden="true" className="row-actions__sep" />

        {/* The consequence line names the subscribers, because they are what
            the delete cannot take back — the 409 only fires on a PAID month,
            and a month with live grants and no payment row behind it (a manual
            grant) deletes without the API saying a word. */}
        <ConfirmButton
          className="chip chip--danger"
          label={c.delete}
          title={c.delete}
          body={c.deleteConfirm}
          consequence={
            month.subscriberCount > 0 ? formatCopy(c.subscribers, { n: month.subscriberCount }) : null
          }
          onConfirm={async () => {
            const result = await deleteMonthAction(courseId, month.id);
            if (result.ok) router.refresh();
            return result;
          }}
        />
      </div>
    </li>
  );
}

/**
 * A new month is created CLOSED, always.
 *
 * Not a choice left to a checkbox: opening a month is refused while the course
 * still has published lectures in no month, and on an existing course that is
 * every lecture on it. A form that defaulted to «مفتوح» — which is what
 * `CourseMonthWriteSchema` defaults to for the API's other callers — would
 * therefore fail on the instructor's very first month with a refusal about
 * lectures he has not been given a way to tag yet. The switch on the row is
 * where a month goes on sale, after its lectures are in it.
 */
function AddMonthForm({ courseId, months }: { courseId: string; months: AdminCourseMonth[] }) {
  const router = useRouter();
  const [monthIndex, setMonthIndex] = useState(String(nextFreeIndex(months)));
  const [title, setTitle] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [pending, setPending] = useState(false);

  const index = Number(monthIndex);
  const canSubmit =
    title.trim().length > 0 && Number.isInteger(index) && index >= 1 && index <= 12;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    const result = await createMonthAction(courseId, {
      monthIndex: index,
      title: title.trim(),
      isOpen: false,
      startsOn: startsOn === '' ? null : startsOn,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setTitle('');
    setStartsOn('');
    setMonthIndex(String(Math.min(index + 1, 12)));
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-20">
          <Label htmlFor="new-month-index">{c.indexLabel}</Label>
          <Input
            id="new-month-index"
            type="number"
            min={1}
            max={12}
            dir="ltr"
            inputMode="numeric"
            value={monthIndex}
            onChange={(event) => setMonthIndex(event.target.value)}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="new-month-title">{c.titleLabel}</Label>
          <Input
            id="new-month-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="w-40">
          <Label htmlFor="new-month-starts-on">{c.startsOnLabel}</Label>
          <Input
            id="new-month-starts-on"
            type="date"
            dir="ltr"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
          />
        </div>
        <Button type="button" disabled={pending || !canSubmit} onClick={() => void submit()}>
          {c.add}
        </Button>
      </div>
      <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.startsOnHint}</p>
    </div>
  );
}

/**
 * «شهور المنهج» — the panel that turns the monthly plan from thirty days into
 * a slice of the syllabus.
 *
 * A sibling of `TermPanel`, deliberately not folded into it: a term groups
 * sections and a month groups lectures, and closing a term revokes access
 * where closing a month only takes it off sale. Two panels, because they are
 * two different promises to the student.
 *
 * ⚠️ An EMPTY list is a real state and not a missing one. A course with no
 * months keeps the old rolling thirty-day subscription, byte for byte, and
 * `c.empty` says so — so this renders the add form under it rather than an
 * error, and nothing on this screen suggests the course is misconfigured.
 */
export function MonthPanel({
  courseId,
  months,
  sections,
}: {
  courseId: string;
  months: AdminCourseMonth[];
  /** The outline, for the «ورّيني المحاضرات دي» list — the lectures are on
   *  this same page and this panel already has them. */
  sections: Section[];
}) {
  // The same number on every row by construction (see `AdminCourseMonthSchema`),
  // so the first one answers for the course. A course with no months yet has
  // no row to carry it, and none of it matters until there is one.
  const untaggedLessonCount = months[0]?.untaggedLessonCount ?? 0;

  return (
    <section>
      <h2 className="mb-1 text-[length:var(--fs-title-4)] font-semibold">{c.title}</h2>
      <p className="mb-3 max-w-[42rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>

      {untaggedLessonCount > 0 ? (
        <UntaggedNotice count={untaggedLessonCount} sections={sections} />
      ) : null}

      {months.length === 0 ? (
        <p className="max-w-[42rem] text-fg-muted">{c.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {months.map((month) => (
            <MonthRow key={month.id} courseId={courseId} month={month} />
          ))}
        </ul>
      )}

      <AddMonthForm courseId={courseId} months={months} />
    </section>
  );
}

/**
 * «الشهر» and «كمان لشهور» — one control, used by the lecture panel AND by the
 * create form, which is the whole point.
 *
 * Pure and controlled: it owns no request and no draft of its own, so the
 * create form can hold the answer before the lecture exists and the panel can
 * write it the moment it changes. Both callers live in `lesson-panel.tsx`.
 *
 * The extras are DISABLED until a primary is picked, rather than failing
 * afterwards: `LessonMonthsWriteSchema` refuses «كمان لشهر ٣» on a lecture
 * that belongs to no month at all — it would be sold in month 3 and belong
 * nowhere — and a control that can express it only to be told no is a control
 * that has to explain a rule it could have prevented.
 */
export function MonthPicker({
  id,
  months,
  value,
  disabled,
  onChange,
}: {
  /** Prefix for the field ids — a lecture id in the panel, a section id in the
   *  create form. Several of these render on one page. */
  id: string;
  months: AdminCourseMonth[];
  value: { primaryMonthId: string | null; extraMonthIds: string[] };
  disabled?: boolean;
  onChange: (next: { primaryMonthId: string | null; extraMonthIds: string[] }) => void;
}) {
  const primary = useMemo(
    () => months.find((month) => month.id === value.primaryMonthId) ?? null,
    [months, value.primaryMonthId],
  );

  function setPrimary(primaryMonthId: string | null) {
    onChange({
      primaryMonthId,
      // Dropping the month also drops the extras — see the contract's third
      // refine. And a month promoted to primary cannot stay in «كمان»: it is
      // «كمان», not «و».
      extraMonthIds:
        primaryMonthId === null
          ? []
          : value.extraMonthIds.filter((monthId) => monthId !== primaryMonthId),
    });
  }

  function toggleExtra(monthId: string, checked: boolean) {
    onChange({
      primaryMonthId: value.primaryMonthId,
      extraMonthIds: checked
        ? [...value.extraMonthIds, monthId]
        : value.extraMonthIds.filter((candidate) => candidate !== monthId),
    });
  }

  const extras = months.filter((month) => month.id !== value.primaryMonthId);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Label htmlFor={`month-primary-${id}`}>{c.assignLabel}</Label>
          {/* A native `<select>` through the UI kit, same as the section's own
              term picker in `section-card.tsx` — one of twelve values, and a
              dropdown is what an instructor already knows how to use. */}
          <Select
            id={`month-primary-${id}`}
            value={value.primaryMonthId ?? ''}
            disabled={disabled}
            onChange={(event) => setPrimary(event.target.value === '' ? null : event.target.value)}
          >
            <option value="">{c.assignNone}</option>
            {months.map((month) => (
              <option key={month.id} value={month.id}>
                {month.title}
              </option>
            ))}
          </Select>
        </div>

        {/*
          «٤٠ مشترك هيشوفوا المحاضرة دي» — the answer to «دي المشتركين مين؟
          المشتركين شهري كام؟», beside the select and at the moment the month
          is picked rather than on a report he has to go and find.

          Live subscribers, not buyers: a refunded subscription is money that
          happened and access that did not, and this number is about who will
          read the lecture he is writing.
        */}
        {primary ? (
          <p className="pb-2 text-[length:var(--fs-text-sm)] text-fg-muted">
            {primary.subscriberCount === 0
              ? c.assignSubscribersNone
              : formatCopy(c.assignSubscribers, { n: primary.subscriberCount })}
          </p>
        ) : null}
      </div>

      {extras.length > 0 ? (
        <fieldset disabled={disabled || value.primaryMonthId === null}>
          <legend className="text-[length:var(--fs-text-sm)] font-semibold">{c.extraLabel}</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {extras.map((month) => (
              <label
                key={month.id}
                className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)]"
              >
                {/* A native checkbox here, not the Radix one: it sits inside a
                    `<fieldset disabled>`, which only reaches real form
                    controls — a Radix checkbox is a `<button>` that would stay
                    pressable while the whole group is meant to be inert. */}
                <input
                  type="checkbox"
                  checked={value.extraMonthIds.includes(month.id)}
                  onChange={(event) => toggleExtra(month.id, event.target.checked)}
                />
                {month.title}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.extraHint}</p>
        </fieldset>
      ) : null}
    </div>
  );
}
