'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { AdminCourseMonth } from '@ayman/contracts/months';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import {
  adoptUntaggedLessonsAction,
  createMonthAction,
  deleteMonthAction,
  fillMonthsAction,
  openMonthForSubscribersAction,
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
const CourseMonthsContext = createContext<AdminCourseMonth[] | null>([]);

/**
 * `months` is `null` when the list could not be READ — see `monthsOrNull` in
 * the page. It is not «مفيش شهور»: treated as `[]`, every «محاضرة جديدة» on a
 * course that sells by month created its lecture in NO month, silently, and
 * that lecture then blocked every month from opening. `useCourseMonthsKnown`
 * lets the create form refuse instead.
 */
export function CourseMonthsProvider({
  months,
  children,
}: {
  months: AdminCourseMonth[] | null;
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
  return useContext(CourseMonthsContext) ?? [];
}

/** Whether the month list was actually read. `false` only after the request
 *  for it failed — every consumer of `useCourseMonths` then sees `[]`, which
 *  is safe for DISPLAY and unsafe for CREATING a lecture. */
export function useCourseMonthsKnown(): boolean {
  return useContext(CourseMonthsContext) !== null;
}

/**
 * The month a NEW lecture in this section starts on, so «محاضرة جديدة» is never
 * a dead button waiting for a choice nine lectures in ten would make the same
 * way.
 *
 * In order:
 *   ١. the month of the section's LAST lecture that has one — lectures are
 *      written in order, so the next one is in the month of the one before it;
 *   ٢. the latest month that already holds lectures — a new, empty section is
 *      usually where the course has got to;
 *   ٣. the first month.
 *
 * `null` only on a course with no months, where there is nothing to choose.
 */
export function defaultMonthId(months: AdminCourseMonth[], sectionLessons: Lesson[]): string | null {
  const known = new Set(months.map((month) => month.id));
  for (let index = sectionLessons.length - 1; index >= 0; index -= 1) {
    const rows = sectionLessons[index]?.months ?? [];
    const monthId = (rows.find((row) => row.isPrimary) ?? rows[0])?.monthId;
    if (monthId && known.has(monthId)) return monthId;
  }
  const byIndex = [...months].sort((a, b) => a.monthIndex - b.monthIndex);
  const latestInUse = byIndex.filter((month) => month.lessonCount > 0).at(-1);
  return latestInUse?.id ?? byIndex[0]?.id ?? null;
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
/*
 * ⚠️ الكويزات جوّه، مش برّه — ولازم تفضل كده.
 *
 * السيرفر بيعدّ **كل** درس منشور في `countUntagged` (`PUBLISHED_ANY`، وكومنته
 * بيقول «QUIZZES INCLUDED» بالحرف). القايمة دي كانت بتستثنيهم.
 *
 * يعني كويز منشور من غير شهر كان بيدّي الشكل ده: السيرفر يرفض يفتح أي شهر
 * ويقول «فيه ١ من غير شهر»، والشاشة تفتح القايمة وتوريه **فاضية**. المدرّس
 * متقاله صلّح حاجة ومش متوريّاله هي فين — وده طريق مقفول مالوش مخرج من
 * اللوحة خالص.
 *
 * والكويز من غير شهر مش حالة نظرية: هو بيتقفل على مشترك الشهر زي المحاضرة
 * بالظبط، يعني الطالب يتفرّج على المحاضرة وبعدين مايعرفش يمتحن عليها.
 */
export function untaggedLessons(sections: Section[]): { section: Section; lesson: Lesson }[] {
  return sections.flatMap((section) =>
    section.lessons
      .filter((lesson) => lesson.isPublished && lesson.months.length === 0)
      .map((lesson) => ({ section, lesson })),
  );
}

/**
 * The refusal, standing — and the fix for it, on the same line.
 *
 * Not a toast and not a state set by the last failed press: while the course
 * has an untagged published lesson, NO month can go on sale, so this is a
 * property of the course and it is on screen until it is fixed. The number
 * comes from the month rows — `untaggedLessonCount` is repeated on every one
 * of them precisely so the admin reads it where the refusal happens.
 *
 * The «حطهم في…» press used to live in a permanent «تظبيط الكورس على الشهور»
 * box under the grid, which rendered on every month course forever — with
 * copy saying «كل محاضراته لسه من غير شهر» on a course where none were. It
 * is only ever needed while this notice is up, so it lives in the notice.
 *
 * ⚠️ The button carries no number. Adopting takes DRAFTS too (a draft left
 * untagged blocks the month the moment it is published), and the count above
 * is published lessons only — a number on the button would disagree with the
 * toast that follows it.
 */
function UntaggedNotice({
  courseId,
  count,
  months,
  sections,
}: {
  courseId: string;
  count: number;
  months: AdminCourseMonth[];
  sections: Section[];
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [pending, setPending] = useState(false);
  const untagged = untaggedLessons(sections);
  // The latest month already in use — where lessons written today belong,
  // nine times in ten. Recomputed until he picks one himself.
  const target =
    months.find((month) => month.id === targetId) ??
    months.find((month) => month.id === defaultMonthId(months, [])) ??
    months[0];

  const adopt = () => {
    if (!target) return;
    setPending(true);
    void adoptUntaggedLessonsAction(courseId, target.id).then((result) => {
      setPending(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        result.adopted === 0 ? c.adoptNone : formatCopy(c.adoptDone, { n: result.adopted }),
      );
    });
  };

  return (
    <div className="month-untagged" role="status">
      <p className="text-[length:var(--fs-text-sm)] text-err">
        {formatCopy(c.blockedByUntagged, { n: count })}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label htmlFor={`month-adopt-${courseId}`}>{c.adoptInto}</Label>
          <Select
            id={`month-adopt-${courseId}`}
            value={target?.id ?? ''}
            disabled={pending}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {months.map((month) => (
              <option key={month.id} value={month.id}>
                {month.title}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" size="sm" disabled={pending || !target} onClick={adopt}>
          {c.adoptCtaShort}
        </Button>
        <button
          type="button"
          className="pb-2 text-[length:var(--fs-text-sm)] underline underline-offset-2"
          aria-expanded={open}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          {c.untaggedLink}
        </button>
      </div>
      <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.adoptNote}</p>

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

/**
 * One month, as a tile: its name, what is in it, who holds it, and the switch.
 *
 * «أقدر أفتح اللي أنا عايزه لما أختار منها» — the switch is ON the tile, one
 * press, instead of inside a card that had to be opened first. It used to sit
 * beside a number field, a date field and the title again; the number is now
 * the month's place in the grid and the date — which no screen anywhere reads
 * (`CourseMonth.startsOn` decides nothing) — is gone from here entirely.
 *
 * Rename and delete are real but rare, so they appear only in «تعديل» mode.
 *
 * ⚠️ Closing revokes NOTHING, unlike the term switch. `TermService.setOpen`
 * bulk-revokes every live grant behind a term; a month's switch only takes it
 * off the shelf, and everyone holding it keeps it. So no confirmation — he
 * will close and reopen a month nine times a year.
 */
function MonthTile({
  courseId,
  month,
  editing,
  draftCount,
}: {
  courseId: string;
  month: AdminCourseMonth;
  editing: boolean;
  /** Lectures in this month still in draft — see `draftLecturesByMonth`. */
  draftCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle(nextOpen: boolean) {
    setPending(true);
    const result = await updateMonthAction(courseId, month.id, { isOpen: nextOpen });
    setPending(false);
    if (!result.ok) {
      // The untagged refusal already has a standing notice above the grid, so
      // the toast's only job is to connect it to the switch that was pressed.
      toast.error(
        result.untaggedLessonCount === undefined
          ? result.message
          : formatCopy(c.blockedByUntagged, {
              n: result.untaggedLessonCount || month.untaggedLessonCount,
            }),
      );
      // The count may be the reason, and it may be stale — a lesson published
      // in another tab. Re-reading is what makes the notice agree with the
      // refusal.
      router.refresh();
      return;
    }
    toast.success(formatCopy(nextOpen ? c.openedToast : c.closedToast, { month: month.title }));
    router.refresh();
  }

  return (
    <li className="month-tile" data-open={month.isOpen ? '' : undefined}>
      <div className="month-tile__head">
        {editing ? (
          <div className="min-w-0 flex-1">
            <InlineTitle
              value={month.title}
              label={c.titleLabel}
              onSave={async (title) => {
                const result = await updateMonthAction(courseId, month.id, { title });
                if (result.ok) router.refresh();
                return result;
              }}
            />
          </div>
        ) : (
          <span className="month-tile__title">{month.title}</span>
        )}
        <Switch
          checked={month.isOpen}
          disabled={pending}
          onCheckedChange={(checked) => void toggle(checked)}
          aria-label={`${c.toggleLabel} — ${month.title}`}
        />
      </div>

      <p className="month-tile__state">{month.isOpen ? c.open : c.closed}</p>
      {/* «لسه من غير محاضرات» and «لسه محدش مشترك» are their own sentences
          rather than a «٠»: a zero reads as a measurement that failed, and
          both are ordinary states a month sits in for weeks. */}
      <p className="month-tile__meta">
        {month.lessonCount === 0 && draftCount === 0
          ? c.lessonsNone
          : formatCopy(c.lessons, { n: month.lessonCount })}
        {draftCount > 0 ? ` · ${formatCopy(c.lessonsDrafts, { n: draftCount })}` : ''}
      </p>
      <p className="month-tile__meta">
        {month.subscriberCount === 0
          ? c.subscribersNone
          : formatCopy(c.subscribers, { n: month.subscriberCount })}
      </p>

      {editing ? (
        /* The consequence line names the subscribers, because they are what
           the delete cannot take back — the 409 only fires on a PAID month,
           and a month with live grants and no payment row behind it (a manual
           grant) deletes without the API saying a word. */
        <ConfirmButton
          className="chip chip--danger month-tile__delete"
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
      ) : null}
    </li>
  );
}

/**
 * Draft lectures per month, from the outline this page already holds.
 *
 * `lessonCount` on a month is PUBLISHED lectures — the number the student's
 * picker shows, and it must stay that. But a month whose lectures he is still
 * writing then read «لسه من غير محاضرات» right after he put four in it. The
 * drafts are counted here, beside it, rather than folded into it: «٢ محاضرة
 * · ٣ مسودة» says both what is on sale and what is coming.
 */
function draftLecturesByMonth(sections: Section[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const lesson of sections.flatMap((section) => section.lessons)) {
    if (lesson.isPublished || lesson.kind === 'quiz') continue;
    for (const row of lesson.months) counts.set(row.monthId, (counts.get(row.monthId) ?? 0) + 1);
  }
  return counts;
}

/** «شهر ٣» — Arabic-Indic digits, the shape every month on the course is
 *  named in (`copy.admin.month.firstMonthTitle`, and the API's `fill`). */
function arabicDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)] ?? digit);
}

/** «كمّل الشهور لحد ١٠» — the school year, which is what he named. */
const FILL_UP_TO = 10;

/**
 * «شهور المنهج» — the panel that turns the monthly plan from thirty days into a
 * slice of the syllabus.
 *
 * What he asked for, in his words: «مش محتاج شهور المنهج دي قدامي… خليها مثلاً
 * عشر أشهر موجودين قدامي وأقدر أفتح اللي أنا عايزه». So the panel is ten tiles
 * with a switch each, and nothing else by default:
 *
 * - no month number to type and no date to pick — the grid IS the order, and
 *   the date decided nothing anywhere;
 * - the missing months up to ten are one press away («كمّل الشهور لحد ١٠»),
 *   created CLOSED so nobody can see or buy them until he opens one;
 * - rename, delete and «شهر جديد» live behind «تعديل»;
 * - the one-time tool for moving a course's EXISTING subscribers onto months
 *   is folded away at the bottom — it is needed once per course, and it was
 *   the box he read as «شوف هيأثر على كام طالب… أنا ما أعرفش ده».
 *
 * A sibling of the terms box, deliberately not folded into it: a term groups
 * sections and a month groups lectures, and closing a term revokes access
 * where closing a month only takes it off sale.
 *
 * ⚠️ Only rendered on a course that HAS months. A course with none keeps the
 * old rolling thirty-day subscription, byte for byte, and gets no months block
 * at all — just `StartByMonth`'s one line inside the pricing block, because
 * that is the only thing there is to say about months on it. Nothing creates a
 * month on such a course except that press: the first month row flips
 * checkout, the gate and the lesson form all at once.
 */
export function MonthPanel({
  courseId,
  months,
  sections,
  monthlyPriced,
}: {
  courseId: string;
  months: AdminCourseMonth[];
  /** The outline, for the «ورّيني الدروس دي» list — the lectures are on this
   *  same page and this panel already has them. */
  sections: Section[];
  /** The course has a monthly price — see the «مفيش شهر مفتوح» warning. */
  monthlyPriced: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  // The same number on every row by construction (see `AdminCourseMonthSchema`),
  // so the first one answers for the course.
  const untaggedLessonCount = months[0]?.untaggedLessonCount ?? 0;
  const drafts = draftLecturesByMonth(sections);
  // Any of 1..10 still missing. Months 11 and 12 (a revision month, a summer
  // month) are his to add by hand and do not count towards «the year».
  const canFill = months.filter((month) => month.monthIndex <= FILL_UP_TO).length < FILL_UP_TO;

  const fill = () => {
    setPending(true);
    void fillMonthsAction(courseId, FILL_UP_TO).then((result) => {
      setPending(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(c.fillDone);
      router.refresh();
    });
  };

  const addOne = () => {
    const monthIndex = nextFreeIndex(months);
    setPending(true);
    void createMonthAction(courseId, {
      monthIndex,
      title: formatCopy(c.defaultTitle, { n: arabicDigits(monthIndex) }),
      // Never open on creation — see `StartByMonth`. The tile's switch is
      // where a month goes on sale, after its lectures are in it.
      isOpen: false,
      startsOn: null,
    }).then((result) => {
      setPending(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {untaggedLessonCount > 0 ? (
        <UntaggedNotice
          courseId={courseId}
          count={untaggedLessonCount}
          months={months}
          sections={sections}
        />
      ) : null}

      {/*
        Every month closed on a course sold monthly means the monthly plan
        cannot be bought at all — the storefront still draws its card, and the
        card is refused at checkout (no month to put in it). New months are
        born closed, so this is the state right after «خلّي الكورس بالشهور»
        and after «كمّل الشهور»: said here, where the switch that fixes it is.
      */}
      {monthlyPriced && months.every((month) => !month.isOpen) ? (
        <p className="month-untagged text-[length:var(--fs-text-sm)] text-err" role="status">
          {c.noneOpenWarning}
        </p>
      ) : null}

      <ul className="month-grid">
        {months.map((month) => (
          <MonthTile
            key={month.id}
            courseId={courseId}
            month={month}
            editing={editing}
            draftCount={drafts.get(month.id) ?? 0}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {canFill ? (
          <Button type="button" size="sm" disabled={pending} onClick={fill}>
            {formatCopy(c.fillCta, { n: arabicDigits(FILL_UP_TO) })}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-pressed={editing}
          onClick={() => setEditing((was) => !was)}
        >
          {editing ? c.editDone : c.edit}
        </Button>
        {editing && months.length < MONTH_INDEXES.length ? (
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={addOne}>
            {c.add}
          </Button>
        ) : null}
      </div>

      <details className="month-tools">
        <summary className="cursor-pointer text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.toolsTitle}
        </summary>
        <SubscribersTool courseId={courseId} months={months} />
      </details>
    </div>
  );
}

/**
 * The ONE press for a course with no months at all.
 *
 * It makes «شهر ١», puts every lesson in it, and then fills the year in up to
 * «شهر ١٠» — all of them CLOSED — because there is only one shape the first
 * month of a running course can have: everything that exists is content the
 * current cohort already paid to see. «كل ده شهر أول.» And the other nine are
 * there because «خليها عشر أشهر موجودين قدامي» is what he asked for.
 *
 * Closed, so nothing changes for anybody until the instructor decides it does
 * — and opening month 1 is refused anyway until the adoption below has run,
 * which is the other half of why the steps are one button and not three.
 */
export function StartByMonth({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const start = async () => {
    // Ten months and every lecture moved into «شهر ١» — undoing it is ten
    // deletes, so it asks once, in words, what is about to happen.
    if (!window.confirm(c.startConfirm)) return;
    setPending(true);
    try {
      const created = await createMonthAction(courseId, {
        monthIndex: 1,
        title: c.firstMonthTitle,
        // Never open on creation. `CourseMonthService` would refuse it anyway
        // while a lecture is untagged — and on this course that is every
        // lecture, including the ones this very press is about to tag.
        isOpen: false,
        startsOn: null,
      });
      const monthId = created.ok ? (created.month?.id ?? null) : null;
      if (!created.ok || monthId === null) {
        toast.error(created.ok ? c.actionFailed : created.message);
        return;
      }
      const adopted = await adoptUntaggedLessonsAction(courseId, monthId);
      if (!adopted.ok) {
        // The month exists and the lectures did not move. Said plainly rather
        // than as a generic failure: the notice above the grid is now one
        // press away from finishing it by hand.
        toast.error(adopted.message);
        return;
      }
      // A failure here leaves «كمّل الشهور لحد ١٠» on the panel that just
      // appeared, one press from done — and the toast says so rather than
      // claiming ten months that do not exist.
      const filled = await fillMonthsAction(courseId, FILL_UP_TO);
      toast.success(
        formatCopy(filled.ok ? c.startDone : c.startDoneFirstOnly, { n: adopted.adopted }),
      );
    } finally {
      setPending(false);
      router.refresh();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-3">
      <p className="min-w-[12rem] flex-1 text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.empty}
      </p>
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => void start()}>
        {c.startCta}
      </Button>
    </div>
  );
}

/**
 * «افتح الشهر للمشتركين الحاليين» — the one-time half of moving an EXISTING
 * course onto months, folded away under «أدوات» because it is needed once per
 * course and nowhere near every visit.
 *
 * Two presses, the first counts and the second writes: the instructor is
 * handing access to students he cannot see from this screen, and «افتح لهم»
 * with no number in front of it is a press nobody can check — the courtesy
 * `term.closedRevoked` gives in the other direction. It only ever ADDS;
 * `setupNote` says so, because «تحويل» is what an instructor will assume and
 * it would be the opposite of the truth.
 */
function SubscribersTool({ courseId, months }: { courseId: string; months: AdminCourseMonth[] }) {
  const [targetId, setTargetId] = useState(months[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const [found, setFound] = useState<number | null>(null);

  // A month deleted under the picker leaves a stale id; falling back to the
  // first keeps the buttons pointing at something real.
  const target = months.find((month) => month.id === targetId) ?? months[0];
  if (!target) return null;

  const openForSubscribers = (dryRun: boolean) => {
    setPending(true);
    void openMonthForSubscribersAction(courseId, target.id, dryRun).then((result) => {
      setPending(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (dryRun) {
        setFound(result.result.students);
        return;
      }
      setFound(null);
      toast.success(
        result.result.grantsWritten === 0
          ? c.subscribersAlreadyDone
          : formatCopy(c.subscribersDone, { n: result.result.grantsWritten }),
      );
    });
  };

  return (
    <div className="mt-2 space-y-2">
      <p className="max-w-[42rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.toolsLead}</p>
      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
        {c.subscribersScope} {c.setupNote}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label htmlFor={`month-subscribers-${courseId}`}>{c.assignLabel}</Label>
          <Select
            id={`month-subscribers-${courseId}`}
            value={target.id}
            onChange={(event) => {
              setTargetId(event.target.value);
              // The count belonged to the previous month; keeping it on screen
              // under a new one would be a number about the wrong thing.
              setFound(null);
            }}
          >
            {months.map((month) => (
              <option key={month.id} value={month.id}>
                {month.title}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => openForSubscribers(true)}
        >
          {c.subscribersCheck}
        </Button>
        {/* Offered only after the count, and only when there is somebody to
            open it for — a button that would write nothing teaches the
            instructor that his press does nothing. */}
        {found !== null && found > 0 ? (
          <Button type="button" size="sm" disabled={pending} onClick={() => openForSubscribers(false)}>
            {c.subscribersOpen}
          </Button>
        ) : null}
      </div>

      {found !== null ? (
        <p className="text-[length:var(--fs-text-sm)]">
          {found === 0 ? c.subscribersNoneFound : formatCopy(c.subscribersFound, { n: found })}
        </p>
      ) : null}
    </div>
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

  /*
   * «كمان لشهور» folds away until it is wanted.
   *
   * With ten months it is nine checkboxes under every «محاضرة جديدة» form and
   * inside every open lecture — for a choice most lectures never make. It
   * starts open only when the lecture already HAS an extra month, because a
   * control that hides a value it holds is how that value gets lost.
   */
  const [extrasShown, setExtrasShown] = useState(value.extraMonthIds.length > 0);
  const extrasOpen = extrasShown || value.extraMonthIds.length > 0;

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

      {extras.length > 0 && !extrasOpen ? (
        <button
          type="button"
          className="text-[length:var(--fs-text-sm)] text-fg-muted underline underline-offset-2 disabled:no-underline"
          disabled={disabled || value.primaryMonthId === null}
          onClick={() => setExtrasShown(true)}
        >
          {c.extraShow}
        </button>
      ) : null}

      {extras.length > 0 && extrasOpen ? (
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
