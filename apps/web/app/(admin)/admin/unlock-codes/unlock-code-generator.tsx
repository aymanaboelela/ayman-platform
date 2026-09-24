'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  CopyCheck,
  Eraser,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircle,
  Minus,
  NotebookPen,
  PartyPopper,
  Plus,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type {
  AdminUnlockCodeCreateInput,
  AdminUnlockCodeRow,
  AdminUnlockCourseOption,
  AdminUnlockCourseTree,
  AdminUnlockLessonNode,
  AdminUnlockSectionNode,
  UnlockItemKind,
} from '@ayman/contracts/admin/unlock-codes';
import { copy } from '@ayman/contracts/copy/admin';
import { toAsciiDigits } from '@ayman/contracts/phone';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Skeleton } from '@ayman/ui/components/skeleton';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import { parsePounds } from '@/lib/pounds';
import { createUnlockCodesAction, loadCourseTreeAction } from './actions';
import { copyText } from './clipboard';
import { CopyCodeButton } from './code-row-actions';
import { CodeText, KIND_META, KindChip, TINT_CARD, TINT_WELL, TONE_TEXT, tone } from './unlock-ui';

const c = copy.admin.unlockCodes;

const MAX_QUANTITY = 50;

interface Picks {
  terms: ReadonlySet<string>;
  months: ReadonlySet<string>;
  sections: ReadonlySet<string>;
  lessons: ReadonlySet<string>;
}

const NO_PICKS: Picks = {
  terms: new Set(),
  months: new Set(),
  sections: new Set(),
  lessons: new Set(),
};

function withMember(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/** «الكورس كله» or the first three titles and «+n» — the `{content}` in the
 *  WhatsApp message, where a list of twelve lectures would bury the code. */
function contentSummary(row: AdminUnlockCodeRow): string {
  if (row.wholeCourse) return c.kind.course;
  const titles = row.items.filter((item) => item.kind !== 'course').map((item) => item.title);
  const head = titles.slice(0, 3).join('، ');
  return titles.length > 3
    ? `${head} ${formatCopy(c.moreItems, { count: titles.length - 3 })}`
    : head;
}

/**
 * «كود جديد» — course → what it opens → how many and for how much → the code.
 *
 * ## Why the tree is loaded per course, through a Server Action
 *
 * The dropdown lists every course, drafts included, and a course is hundreds
 * of lectures. Fetching every tree up front would make the whole screen wait
 * on the biggest course to show a list of codes. The action is a read with
 * the admin's own cookie — same authorisation as the page.
 *
 * ## What is sent is what is VISIBLE, not what is stored
 *
 * A unit picked whole, and three of its lectures picked before that, is one
 * `section` item — the lectures are covered, shown checked and disabled, and
 * dropped from the payload. Same one level up: a term covers its units. So the
 * counter and the request agree, and the student's «فتحت إيه» list does not
 * repeat a lecture inside the unit that already opened it.
 */
export function UnlockCodeGenerator({ courses }: { courses: readonly AdminUnlockCourseOption[] }) {
  const router = useRouter();

  const [courseId, setCourseId] = useState('');
  const [tree, setTree] = useState<AdminUnlockCourseTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  // Every course change bumps this; a tree that arrives for an older ticket is
  // dropped — otherwise a slow first course can land over a fast second one.
  const ticket = useRef(0);

  const [wholeCourse, setWholeCourse] = useState(false);
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const [quantityText, setQuantityText] = useState('1');
  const [priceText, setPriceText] = useState('');
  const [note, setNote] = useState('');

  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<AdminUnlockCodeRow[] | null>(null);
  const [origin, setOrigin] = useState('');

  // `toAsciiDigits` because a phone keyboard set to Arabic types «٣», and
  // `parseInt('٣')` is NaN — which would silently make every such entry one.
  const quantity = Math.min(
    MAX_QUANTITY,
    Math.max(1, Number.parseInt(toAsciiDigits(quantityText), 10) || 1),
  );
  const price = parsePounds(priceText);

  const picked = useMemo(() => {
    const items: { kind: UnlockItemKind; id: string; title: string }[] = [];
    if (!tree) return items;
    for (const term of tree.terms) {
      if (picks.terms.has(term.id)) items.push({ kind: 'term', id: term.id, title: term.title });
    }
    for (const month of tree.months) {
      if (picks.months.has(month.id)) items.push({ kind: 'month', id: month.id, title: month.title });
    }
    for (const section of tree.sections) {
      if (section.termId !== null && picks.terms.has(section.termId)) continue;
      if (picks.sections.has(section.id)) {
        items.push({ kind: 'section', id: section.id, title: section.title });
        continue;
      }
      for (const lesson of section.lessons) {
        if (picks.lessons.has(lesson.id)) {
          items.push({ kind: 'lesson', id: lesson.id, title: lesson.title });
        }
      }
    }
    return items;
  }, [tree, picks]);

  const somethingPicked = wholeCourse || picked.length > 0;
  const canSubmit =
    tree !== null && somethingPicked && price.kind !== 'invalid' && !pending;

  function clearPicks() {
    setWholeCourse(false);
    setPicks(NO_PICKS);
  }

  async function chooseCourse(id: string) {
    const mine = ++ticket.current;
    setCourseId(id);
    setTree(null);
    setTreeError(null);
    setExpanded(new Set());
    clearPicks();
    if (id === '') {
      setTreeLoading(false);
      return;
    }
    setTreeLoading(true);
    const result = await loadCourseTreeAction(id);
    if (mine !== ticket.current) return;
    setTreeLoading(false);
    if (result.ok) {
      setTree(result.tree);
      // One unit is the common case for a new course — open it, rather than
      // making the admin find the chevron to see the only list there is.
      const only = result.tree.sections.length === 1 ? result.tree.sections[0] : undefined;
      if (only) setExpanded(new Set([only.id]));
    } else {
      setTreeError(result.message);
    }
  }

  async function submit() {
    if (!canSubmit || !tree) return;
    const input: AdminUnlockCodeCreateInput = {
      courseId: tree.course.id,
      wholeCourse,
      items: wholeCourse ? [] : picked.map(({ kind, id }) => ({ kind, id })),
      quantity,
      priceCents: price.kind === 'valid' ? price.cents : null,
      note: note.trim() === '' ? null : note.trim(),
    };
    setPending(true);
    const result = await createUnlockCodesAction(input);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setOrigin(window.location.origin);
    setCreated(result.codes);
    router.refresh();
  }

  function again() {
    // The course and its tree stay: the next sale is usually the next lecture
    // of the same course, and re-picking the course would refetch its tree.
    setCreated(null);
    clearPicks();
    setQuantityText('1');
    setPriceText('');
    setNote('');
  }

  const selectedCourse = courses.find((course) => course.id === courseId);

  return (
    <section
      aria-labelledby="unlock-generator-title"
      style={tone('var(--a-9)')}
      className="mt-6 overflow-hidden rounded-lg border border-[color-mix(in_oklab,var(--a-9)_38%,var(--border))] bg-surface-2 shadow-[var(--shadow-md)]"
    >
      <header className="flex items-center gap-3 border-b border-[color-mix(in_oklab,var(--a-9)_24%,var(--border))] bg-[color-mix(in_oklab,var(--a-9)_11%,var(--n-2))] px-4 py-4 sm:px-6">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-lg', TINT_WELL)}>
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="unlock-generator-title"
            className="text-[length:var(--fs-title-3)] font-semibold text-fg"
          >
            {created ? (created.length > 1 ? formatCopy(c.readyManyTitle, { count: created.length }) : c.readyTitle) : c.createTitle}
          </h2>
          <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">
            {created ? c.readyLead : c.createLead}
          </p>
        </div>
      </header>

      {created ? (
        <ReadyPanel codes={created} origin={origin} onAgain={again} />
      ) : (
        <div className="divide-y divide-line-subtle">
          {/* ── Step 1 — the course ─────────────────────────────────────── */}
          <Step n={1} title={c.step1} done={tree !== null}>
            <label className="block max-w-xl">
              <span className="sr-only">{c.step1}</span>
              <span className="relative block">
                <BookOpen
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-accent-text"
                  aria-hidden="true"
                />
                <select
                  value={courseId}
                  onChange={(event) => void chooseCourse(event.target.value)}
                  className={cn(
                    'h-11 w-full rounded-lg border border-line bg-surface-1 ps-9 pe-3',
                    'text-[1rem] text-fg md:text-[length:var(--fs-text-base)]',
                    'transition-colors duration-[160ms] ease-out hover:border-accent/50 focus:border-accent focus:outline-none',
                  )}
                >
                  <option value="">{c.coursePlaceholder}</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.published ? course.title : formatCopy(c.draftOption, { title: course.title })}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {selectedCourse && !selectedCourse.published ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-warn">
                <EyeOff className="size-3.5" aria-hidden="true" />
                {c.draft}
              </p>
            ) : null}
          </Step>

          {/* ── Step 2 — what the code opens ────────────────────────────── */}
          {courseId !== '' ? (
            <Step n={2} title={c.step2} done={somethingPicked}>
              {treeLoading ? (
                <TreeSkeleton />
              ) : treeError ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color-mix(in_oklab,var(--err)_40%,var(--border))] bg-[color-mix(in_oklab,var(--err)_8%,var(--n-2))] p-3">
                  <p className="text-[length:var(--fs-text-sm)] text-err">{treeError}</p>
                  <Button size="sm" variant="secondary" onClick={() => void chooseCourse(courseId)}>
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {copy.admin.autosave.retry}
                  </Button>
                </div>
              ) : tree ? (
                <div className="flex flex-col gap-5">
                  <WholeCourseToggle on={wholeCourse} onChange={setWholeCourse} />

                  <fieldset
                    disabled={wholeCourse}
                    className={cn(
                      'm-0 flex min-w-0 flex-col gap-5 border-0 p-0 transition-opacity duration-200',
                      wholeCourse && 'pointer-events-none select-none opacity-40',
                    )}
                  >
                    {tree.terms.length > 0 ? (
                      <PickGroup title={c.terms} kind="term">
                        {tree.terms.map((term) => (
                          <PickCard
                            key={term.id}
                            kind="term"
                            title={term.title}
                            picked={picks.terms.has(term.id)}
                            onChange={(on) =>
                              setPicks((p) => ({ ...p, terms: withMember(p.terms, term.id, on) }))
                            }
                          />
                        ))}
                      </PickGroup>
                    ) : null}

                    {tree.months.length > 0 ? (
                      <PickGroup title={c.months} kind="month">
                        {tree.months.map((month) => (
                          <PickCard
                            key={month.id}
                            kind="month"
                            title={month.title}
                            meta={formatCopy(c.lessonsCount, { count: month.lessonCount })}
                            picked={picks.months.has(month.id)}
                            onChange={(on) =>
                              setPicks((p) => ({ ...p, months: withMember(p.months, month.id, on) }))
                            }
                          />
                        ))}
                      </PickGroup>
                    ) : null}

                    <div>
                      <GroupTitle title={c.units} kind="section" />
                      {tree.sections.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-line bg-surface-1 p-4 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
                          {c.courseEmpty}
                        </p>
                      ) : (
                        <UnitList
                          tree={tree}
                          picks={picks}
                          expanded={expanded}
                          onExpand={(id) =>
                            setExpanded((prev) => withMember(prev, id, !prev.has(id)))
                          }
                          onSection={(id, on) =>
                            setPicks((p) => ({ ...p, sections: withMember(p.sections, id, on) }))
                          }
                          onLesson={(id, on) =>
                            setPicks((p) => ({ ...p, lessons: withMember(p.lessons, id, on) }))
                          }
                        />
                      )}
                    </div>
                  </fieldset>

                  <SelectionBar
                    wholeCourse={wholeCourse}
                    picked={picked}
                    onClear={clearPicks}
                  />
                </div>
              ) : null}
            </Step>
          ) : null}

          {/* ── Step 3 — details, and the button ─────────────────────────── */}
          {tree !== null ? (
            <Step n={3} title={c.step3} done={false}>
              <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)]">
                <div>
                  <Label htmlFor="unlock-quantity">{c.quantity}</Label>
                  <div className="flex h-11 w-fit items-stretch overflow-hidden rounded-lg border border-line bg-surface-1">
                    <StepperButton
                      icon={Minus}
                      label={c.quantityLess}
                      disabled={quantity <= 1}
                      onClick={() => setQuantityText(String(Math.max(1, quantity - 1)))}
                    />
                    <input
                      id="unlock-quantity"
                      inputMode="numeric"
                      dir="ltr"
                      value={quantityText}
                      onChange={(event) => setQuantityText(event.target.value.slice(0, 3))}
                      onBlur={() => setQuantityText(String(quantity))}
                      className="w-14 border-x border-line bg-transparent text-center text-[1.125rem] font-semibold tabular-nums text-fg [unicode-bidi:isolate] focus:bg-surface-2 focus:outline-none"
                    />
                    <StepperButton
                      icon={Plus}
                      label={c.quantityMore}
                      disabled={quantity >= MAX_QUANTITY}
                      onClick={() => setQuantityText(String(Math.min(MAX_QUANTITY, quantity + 1)))}
                    />
                  </div>
                  <p className="mt-1.5 max-w-[16rem] text-[length:var(--fs-text-xs)] text-fg-muted">
                    {c.quantityHint}
                  </p>
                </div>

                <div className="min-w-0">
                  <Label htmlFor="unlock-price">{c.price}</Label>
                  <Input
                    id="unlock-price"
                    inputMode="decimal"
                    dir="ltr"
                    autoComplete="off"
                    value={priceText}
                    invalid={price.kind === 'invalid'}
                    onChange={(event) => setPriceText(event.target.value)}
                    className="h-11 rounded-lg bg-surface-1 text-start tabular-nums [unicode-bidi:isolate]"
                  />
                  <p className="mt-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">{c.priceHint}</p>
                </div>

                <div className="min-w-0">
                  <Label htmlFor="unlock-note">{c.note}</Label>
                  <Input
                    id="unlock-note"
                    value={note}
                    maxLength={500}
                    placeholder={c.notePlaceholder}
                    onChange={(event) => setNote(event.target.value)}
                    className="h-11 rounded-lg bg-surface-1"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className={cn(
                    'text-[length:var(--fs-text-sm)]',
                    somethingPicked ? 'text-fg-muted' : 'text-warn',
                  )}
                >
                  {somethingPicked ? null : c.nothingPicked}
                </p>
                <Button
                  onClick={() => void submit()}
                  disabled={!canSubmit}
                  className="h-12 w-full px-6 text-[length:var(--fs-text-base)] font-semibold sm:w-auto"
                >
                  {pending ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="size-5" aria-hidden="true" />
                  )}
                  {pending
                    ? c.generating
                    : quantity > 1
                      ? formatCopy(c.generateMany, { count: quantity })
                      : c.generate}
                </Button>
              </div>
            </Step>
          ) : null}
        </div>
      )}
    </section>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-full text-[length:var(--fs-text-sm)] font-semibold tabular-nums transition-colors',
            done ? 'bg-ok text-surface-1' : 'bg-accent text-[#1A1206]',
          )}
        >
          {done ? <Check className="size-4" strokeWidth={2.75} /> : n}
        </span>
        <h3 className="text-[length:var(--fs-text-base)] font-semibold text-fg">{title}</h3>
      </div>
      <div className="md:ps-[2.375rem]">{children}</div>
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <p className="inline-flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
        <Loader2 className="size-4 animate-spin text-accent-text" aria-hidden="true" />
        {c.courseLoading}
      </p>
      <Skeleton className="h-16 rounded-lg" />
      <div className="grid gap-2 sm:grid-cols-3">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
      <Skeleton className="h-14 rounded-lg" />
      <Skeleton width="wide" className="h-14 rounded-lg" />
    </div>
  );
}

function WholeCourseToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const Icon = KIND_META.course.icon;
  return (
    <label
      style={tone(KIND_META.course.color)}
      className={cn(
        'flex cursor-pointer items-center gap-3.5 rounded-lg border-2 p-4 transition-colors duration-200',
        on
          ? 'border-[color:var(--uc-tone)] bg-[color-mix(in_oklab,var(--uc-tone)_13%,var(--n-2))]'
          : 'border-dashed border-[color-mix(in_oklab,var(--uc-tone)_40%,var(--border))] bg-surface-1 hover:bg-[color-mix(in_oklab,var(--uc-tone)_6%,var(--n-1))]',
      )}
    >
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-lg', TINT_WELL)}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--fs-text-lg)] font-semibold text-fg">
          {c.wholeCourse}
        </span>
        <span className="mt-0.5 block text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.wholeCourseHint}
        </span>
      </span>
      <Switch checked={on} onCheckedChange={onChange} />
    </label>
  );
}

function GroupTitle({ title, kind }: { title: string; kind: UnlockItemKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <h4
      style={tone(meta.color)}
      className="mb-2.5 flex items-center gap-2 text-[length:var(--fs-text-sm)] font-semibold text-fg"
    >
      <Icon className="size-4 text-[color:var(--uc-tone)]" aria-hidden="true" />
      {title}
    </h4>
  );
}

function PickGroup({
  title,
  kind,
  children,
}: {
  title: string;
  kind: UnlockItemKind;
  children: ReactNode;
}) {
  return (
    <div>
      <GroupTitle title={title} kind={kind} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

/** A term or a month, picked whole — a pressable card rather than a bare
 *  checkbox, because on a phone these are thumb targets in a grid. */
function PickCard({
  kind,
  title,
  meta,
  picked,
  onChange,
}: {
  kind: UnlockItemKind;
  title: string;
  meta?: string;
  picked: boolean;
  onChange: (on: boolean) => void;
}) {
  const tint = KIND_META[kind];
  const Icon = tint.icon;
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={() => onChange(!picked)}
      style={tone(tint.color)}
      className={cn(
        'flex min-h-12 min-w-0 items-center gap-2.5 rounded-lg border p-2.5 text-start transition-colors duration-[160ms]',
        picked
          ? cn(TINT_CARD, 'ring-1 ring-[color:var(--uc-tone)]')
          : 'border-line bg-surface-1 hover:border-[color-mix(in_oklab,var(--uc-tone)_50%,var(--border))]',
      )}
    >
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', TINT_WELL)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--fs-text-sm)] font-medium text-fg">
          {title}
        </span>
        {meta ? (
          <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">{meta}</span>
        ) : null}
      </span>
      <Tick on={picked} />
    </button>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
        on ? 'border-transparent bg-[color:var(--uc-tone)] text-surface-1' : 'border-line',
      )}
    >
      {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </span>
  );
}

/**
 * The units, grouped under their terms when the course has any — a unit is
 * covered by its term, and seeing them together is what makes the disabled
 * checkboxes read as «already included» rather than «broken».
 */
function UnitList({
  tree,
  picks,
  expanded,
  onExpand,
  onSection,
  onLesson,
}: {
  tree: AdminUnlockCourseTree;
  picks: Picks;
  expanded: ReadonlySet<string>;
  onExpand: (id: string) => void;
  onSection: (id: string, on: boolean) => void;
  onLesson: (id: string, on: boolean) => void;
}) {
  const termIds = new Set(tree.terms.map((term) => term.id));
  const groups: { id: string; title: string | null; sections: AdminUnlockSectionNode[] }[] = [
    ...tree.terms.map((term) => ({
      id: term.id,
      title: term.title as string | null,
      sections: tree.sections.filter((section) => section.termId === term.id),
    })),
    {
      id: 'none',
      title: null,
      sections: tree.sections.filter(
        (section) => section.termId === null || !termIds.has(section.termId),
      ),
    },
  ].filter((group) => group.sections.length > 0);

  const termTint = KIND_META.term;
  const TermIcon = termTint.icon;

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.id}>
          {group.title !== null && groups.length > 1 ? (
            <p
              style={tone(termTint.color)}
              className={cn(
                'mb-2 inline-flex items-center gap-1.5 text-[length:var(--fs-text-xs)] font-semibold',
                TONE_TEXT,
              )}
            >
              <TermIcon className="size-3.5" aria-hidden="true" />
              {group.title}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {group.sections.map((section) => (
              <UnitRow
                key={section.id}
                section={section}
                coveredByTerm={section.termId !== null && picks.terms.has(section.termId)}
                picked={picks.sections.has(section.id)}
                pickedLessons={picks.lessons}
                open={expanded.has(section.id)}
                onExpand={() => onExpand(section.id)}
                onSection={(on) => onSection(section.id, on)}
                onLesson={onLesson}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UnitRow({
  section,
  coveredByTerm,
  picked,
  pickedLessons,
  open,
  onExpand,
  onSection,
  onLesson,
}: {
  section: AdminUnlockSectionNode;
  coveredByTerm: boolean;
  picked: boolean;
  pickedLessons: ReadonlySet<string>;
  open: boolean;
  onExpand: () => void;
  onSection: (on: boolean) => void;
  onLesson: (id: string, on: boolean) => void;
}) {
  const whole = coveredByTerm || picked;
  const inside = whole ? 0 : section.lessons.filter((lesson) => pickedLessons.has(lesson.id)).length;
  const tint = KIND_META.section;
  const Icon = tint.icon;
  const panelId = `unit-${section.id}`;

  return (
    <li
      style={tone(tint.color)}
      className={cn(
        'overflow-hidden rounded-lg border transition-colors duration-[160ms]',
        whole || inside > 0 ? TINT_CARD : 'border-line bg-surface-1',
      )}
    >
      <div className="flex items-center gap-2 p-2 sm:p-2.5">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 text-start"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-fg-muted transition-transform duration-200',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', TINT_WELL)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[length:var(--fs-text-sm)] font-semibold text-fg">
              {section.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              <span className="tabular-nums">
                {formatCopy(c.lessonsCount, { count: section.lessons.length })}
              </span>
              {inside > 0 ? (
                <span className={cn('font-semibold tabular-nums', TONE_TEXT)}>
                  {formatCopy(c.selected, { count: inside })}
                </span>
              ) : null}
              {section.published ? null : <MiniBadge icon={EyeOff} label={c.unpublished} />}
            </span>
          </span>
        </button>
        <label
          className={cn(
            'flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2.5',
            'text-[length:var(--fs-text-xs)] font-medium',
            whole
              ? 'border-[color-mix(in_oklab,var(--uc-tone)_45%,var(--border))] bg-[color-mix(in_oklab,var(--uc-tone)_14%,var(--n-2))] text-fg'
              : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
            coveredByTerm && 'cursor-default',
          )}
          title={c.wholeUnitHint}
        >
          <Checkbox
            checked={whole}
            disabled={coveredByTerm}
            onCheckedChange={(value) => onSection(value === true)}
          />
          {c.wholeUnit}
        </label>
      </div>

      {open ? (
        <ul id={panelId} className="border-t border-line-subtle bg-surface-1">
          {section.lessons.length === 0 ? (
            <li className="px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
              {c.courseEmpty}
            </li>
          ) : (
            section.lessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                covered={whole}
                picked={pickedLessons.has(lesson.id)}
                onChange={(on) => onLesson(lesson.id, on)}
              />
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
}

function LessonRow({
  lesson,
  covered,
  picked,
  onChange,
}: {
  lesson: AdminUnlockLessonNode;
  covered: boolean;
  picked: boolean;
  onChange: (on: boolean) => void;
}) {
  const tint = KIND_META.lesson;
  const Icon = tint.icon;
  const on = covered || picked;
  return (
    <li className="border-b border-line-subtle last:border-b-0">
      <label
        style={tone(tint.color)}
        className={cn(
          'flex items-start gap-3 px-3 py-2.5 sm:ps-12',
          covered ? 'cursor-default' : 'cursor-pointer hover:bg-surface-2',
          picked && !covered && 'bg-[color-mix(in_oklab,var(--uc-tone)_8%,var(--n-1))]',
        )}
      >
        <Checkbox
          checked={on}
          disabled={covered}
          onCheckedChange={(value) => onChange(value === true)}
          className="mt-0.5"
        />
        <Icon className="mt-0.5 size-4 shrink-0 text-[color:var(--uc-tone)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-[length:var(--fs-text-sm)] [overflow-wrap:anywhere]',
              on ? 'font-medium text-fg' : 'text-fg',
              !lesson.published && 'text-fg-muted',
            )}
          >
            {lesson.title}
          </span>
          {lesson.hasQuiz || lesson.hasHomework || !lesson.published ? (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {lesson.hasQuiz ? (
                <MiniBadge icon={ClipboardCheck} label={c.quiz} color="var(--info)" />
              ) : null}
              {lesson.hasHomework ? (
                <MiniBadge icon={NotebookPen} label={c.homework} color="var(--warn)" />
              ) : null}
              {lesson.published ? null : <MiniBadge icon={EyeOff} label={c.unpublished} />}
            </span>
          ) : null}
        </span>
      </label>
    </li>
  );
}

/** «كويز» / «واجب» / «مش منشورة». No `color` is the neutral one — an
 *  unpublished lecture is a fact to notice, not a state to alarm about. */
function MiniBadge({ icon: Icon, label, color }: { icon: LucideIcon; label: string; color?: string }) {
  return (
    <span
      style={color ? tone(color) : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
        color ? cn(TINT_CARD, TONE_TEXT) : 'border border-line bg-surface-3 text-fg-muted',
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function SelectionBar({
  wholeCourse,
  picked,
  onClear,
}: {
  wholeCourse: boolean;
  picked: readonly { kind: UnlockItemKind; id: string; title: string }[];
  onClear: () => void;
}) {
  const any = wholeCourse || picked.length > 0;
  return (
    <div
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border p-2.5',
        any
          ? 'border-[color-mix(in_oklab,var(--a-9)_35%,var(--border))] bg-[color-mix(in_oklab,var(--a-9)_8%,var(--n-1))]'
          : 'border-dashed border-line bg-surface-1',
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--fs-text-sm)] font-semibold tabular-nums',
          any ? 'bg-accent text-[#1A1206]' : 'bg-surface-3 text-fg-muted',
        )}
      >
        <CheckCheck className="size-4" aria-hidden="true" />
        {wholeCourse ? c.wholeCourse : formatCopy(c.selected, { count: picked.length })}
      </span>
      {wholeCourse
        ? null
        : picked.slice(0, 4).map((item) => (
            <KindChip key={item.id} kind={item.kind} label={item.title} className="max-w-[14rem]" />
          ))}
      {!wholeCourse && picked.length > 4 ? (
        <span className="text-[length:var(--fs-text-xs)] font-semibold text-fg-muted tabular-nums">
          {formatCopy(c.moreItems, { count: picked.length - 4 })}
        </span>
      ) : null}
      {any ? (
        <button
          type="button"
          onClick={onClear}
          className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <Eraser className="size-4" aria-hidden="true" />
          {c.clearSelection}
        </button>
      ) : null}
    </div>
  );
}

function StepperButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid w-11 place-items-center text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

/* ── «الكود جاهز» ────────────────────────────────────────────────────────── */

function ReadyPanel({
  codes,
  origin,
  onAgain,
}: {
  codes: readonly AdminUnlockCodeRow[];
  origin: string;
  onAgain: () => void;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const first = codes[0];
  if (!first) return null;

  const content = contentSummary(first);
  const many = codes.length > 1;

  function shareHref(code: string): string {
    const text = formatCopy(c.shareText, {
      content,
      course: first!.course.title,
      code,
      url: `${origin}/codes`,
    });
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  async function copyAll() {
    if (!(await copyText(codes.map((row) => row.code).join('\n')))) {
      toast.error(c.errorGeneric);
      return;
    }
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  }

  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span
          style={tone('var(--ok)')}
          className={cn('grid size-12 shrink-0 place-items-center rounded-full', TINT_WELL)}
        >
          <PartyPopper className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="inline-flex max-w-full items-center gap-1.5 text-[length:var(--fs-text-sm)] font-semibold text-fg">
            <BookOpen className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
            <span className="truncate">{first.course.title}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {first.wholeCourse ? (
              <KindChip kind="course" label={c.kind.course} />
            ) : (
              first.items.map((item) => (
                <KindChip
                  key={`${item.kind}-${item.id}`}
                  kind={item.kind}
                  label={item.title}
                  hint={item.parentTitle ? `${item.parentTitle} — ${item.title}` : item.title}
                  className="max-w-[16rem]"
                />
              ))
            )}
          </div>
        </div>
      </div>

      <ul className={cn('mt-5 grid gap-3', many && 'sm:grid-cols-2 xl:grid-cols-3')}>
        {codes.map((row) => (
          <li key={row.id}>
            <CodeTicket code={row.code} big={!many} share={shareHref(row.code)} />
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {many ? (
          <Button variant="secondary" onClick={() => void copyAll()}>
            <CopyCheck className="size-4" aria-hidden="true" />
            {copiedAll ? c.copied : c.copyAll}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onAgain} className="border border-line">
          <RotateCcw className="size-4" aria-hidden="true" />
          {c.newOne}
        </Button>
      </div>
    </div>
  );
}

/**
 * One code, as a ticket: dashed edge, two punched notches, the code large
 * enough to read off the screen to a student on the phone.
 */
function CodeTicket({ code, big, share }: { code: string; big: boolean; share: string }) {
  return (
    <div
      style={tone('var(--a-9)')}
      className={cn(
        'relative overflow-hidden rounded-lg border-2 border-dashed px-5',
        'border-[color-mix(in_oklab,var(--uc-tone)_55%,var(--border))] bg-[color-mix(in_oklab,var(--uc-tone)_9%,var(--n-2))]',
        big ? 'py-7' : 'py-5',
      )}
    >
      {/* The punched notches — the panel's own surface, so they read as holes. */}
      <span
        aria-hidden="true"
        className="absolute -start-3.5 top-1/2 size-7 -translate-y-1/2 rounded-full border-2 border-dashed border-[color-mix(in_oklab,var(--uc-tone)_55%,var(--border))] bg-surface-2"
      />
      <span
        aria-hidden="true"
        className="absolute -end-3.5 top-1/2 size-7 -translate-y-1/2 rounded-full border-2 border-dashed border-[color-mix(in_oklab,var(--uc-tone)_55%,var(--border))] bg-surface-2"
      />
      <div className="flex flex-col items-center gap-4 text-center">
        <CodeText
          code={code}
          className={cn(
            'block leading-none tracking-[0.22em] ps-[0.22em]',
            big
              ? 'text-[length:var(--fs-display-2)]'
              : 'text-[length:var(--fs-title-1)]',
          )}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <CopyCodeButton code={code} className="h-10 px-4 md:h-10" />
          <a
            href={share}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-[length:var(--fs-text-sm)] font-semibold',
              // WhatsApp's own green, same as `components/admin/whatsapp-button.tsx`:
              // a brand mark, so it must not follow the tenant-settable accent.
              'bg-[#25D366] text-[#0B1F14] transition-opacity duration-[160ms] ease-out hover:opacity-90',
            )}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {c.shareWhatsapp}
          </a>
        </div>
      </div>
    </div>
  );
}
