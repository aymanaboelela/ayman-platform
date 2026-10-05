'use client';

import { useId, useMemo, useState, useTransition, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  CHALLENGE_MIN_QUESTIONS,
  challengeShortFor,
  type AdminChallengeTopic,
  type AdminChallengeTopics,
  type ChallengeMinKey,
} from '@ayman/contracts/quiz/challenges';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import {
  createChallengeAction,
  deleteChallengeAction,
  reorderChallengesAction,
  updateChallengeAction,
  type ChallengeResult,
} from './challenge-actions';

const c = copy.admin.challenges;

/** لون لكل تحدّي بالترتيب — نفس ألوان الرسومات في اللوحة. */
const TONES = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)'];

const MODE_LABEL: Record<ChallengeMinKey, string> = {
  millionaire: c.modeMillionaire,
  race: c.modeRace,
  survival: c.modeSurvival,
  practice: c.modePractice,
  arena: c.modeArena,
};

interface Draft {
  title: string;
  sectionIds: string[];
  lessonIds: string[];
  isActive: boolean;
}

/**
 * «قسم التحديات» لكورس واحد — صف ملوّن لكل تحدّي فيه أزراره (تشغيل، ترتيب،
 * تعديل، مسح)، وفورم واحد بيتفتح مكانه للإضافة أو التعديل.
 *
 * كل حفظ بيرجّع الشاشة كلها من السيرفر — الأعداد بتتحسب هناك بنفس كويري
 * الطالب، فالرقم اللي هنا هو اللي الطالب هيلاقيه (من غير فرق النظام
 * والامتحانات اللي سلّمها — `c.howCount`).
 */
export function ChallengeTopics({ initial }: { initial: AdminChallengeTopics }) {
  const [detail, setDetail] = useState(initial);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const apply = (send: () => Promise<ChallengeResult>, after?: () => void) =>
    start(async () => {
      const result = await send();
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setDetail(result.detail);
      after?.();
    });

  const move = (index: number, by: -1 | 1) => {
    const ids = detail.topics.map((topic) => topic.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    apply(() => reorderChallengesAction(detail.courseId, ids));
  };

  if (detail.foundation) {
    return <p className="rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">{c.foundation}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {detail.topics.length === 0 && editing !== 'new' ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">{c.none}</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {detail.topics.map((topic, index) =>
          editing === topic.id ? (
            <li key={topic.id}>
              <TopicForm
                detail={detail}
                initial={topic}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(draft) =>
                  apply(() => updateChallengeAction(detail.courseId, topic.id, draft), () => setEditing(null))
                }
              />
            </li>
          ) : (
            <TopicRow
              key={topic.id}
              topic={topic}
              tone={TONES[index % TONES.length]!}
              first={index === 0}
              last={index === detail.topics.length - 1}
              pending={pending}
              onToggle={(isActive) => apply(() => updateChallengeAction(detail.courseId, topic.id, { isActive }))}
              onUp={() => move(index, -1)}
              onDown={() => move(index, 1)}
              onEdit={() => setEditing(topic.id)}
              onDelete={() => {
                if (window.confirm(formatCopy(c.removeConfirm, { title: topic.title }))) {
                  apply(() => deleteChallengeAction(detail.courseId, topic.id));
                }
              }}
            />
          ),
        )}
      </ul>

      {editing === 'new' ? (
        <TopicForm
          detail={detail}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(draft) => apply(() => createChallengeAction(detail.courseId, draft), () => setEditing(null))}
        />
      ) : (
        <div>
          <Button onClick={() => setEditing('new')} disabled={pending || detail.sections.length === 0}>
            <Plus className="size-4" aria-hidden="true" />
            {c.add}
          </Button>
        </div>
      )}

      {failed ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-err">
          {c.failed}
        </p>
      ) : null}
      <p className="text-[length:var(--fs-text-xs)] text-fg-subtle">{c.howCount}</p>
    </div>
  );
}

function TopicRow({
  topic,
  tone,
  first,
  last,
  pending,
  onToggle,
  onUp,
  onDown,
  onEdit,
  onDelete,
}: {
  topic: AdminChallengeTopic;
  tone: string;
  first: boolean;
  last: boolean;
  pending: boolean;
  onToggle: (isActive: boolean) => void;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const short = challengeShortFor(topic.ready.total);
  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:p-4"
      data-active={topic.isActive || undefined}
      style={
        {
          '--tone': tone,
          background: topic.isActive
            ? 'linear-gradient(160deg, color-mix(in oklab, var(--tone) 14%, var(--color-surface-2)), var(--color-surface-2) 60%)'
            : 'var(--color-surface-2)',
          opacity: topic.isActive ? 1 : 0.8,
        } as CSSProperties
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[color-mix(in_oklab,var(--tone)_22%,transparent)] text-[color:var(--tone)]">
            <Swords className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-fg [overflow-wrap:anywhere]">{topic.title}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[length:var(--fs-text-xs)]">
              {topic.sectionIds.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-fg">
                  <Layers className="size-3" aria-hidden="true" />
                  {formatCopy(c.pickedUnits, { n: topic.sectionIds.length })}
                </span>
              ) : null}
              {topic.lessonIds.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-fg">
                  <ListChecks className="size-3" aria-hidden="true" />
                  {formatCopy(c.pickedLessons, { n: topic.lessonIds.length })}
                </span>
              ) : null}
              <span className="rounded-full bg-[color-mix(in_oklab,var(--tone)_20%,transparent)] px-2 py-0.5 font-semibold text-fg">
                {formatCopy(c.readyTotal, { n: topic.ready.total })}
              </span>
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-fg-muted">
                {formatCopy(c.readyStreams, { general: topic.ready.general, languages: topic.ready.languages })}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-xs)]">
              {short.length === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--ok)_16%,transparent)] px-2 py-0.5 text-ok">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  {c.enough}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] px-2 py-0.5 text-warn">
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  {formatCopy(c.shortFor, {
                    modes: short.map((key) => formatCopy(MODE_LABEL[key], { n: CHALLENGE_MIN_QUESTIONS[key] })).join('، '),
                  })}
                </span>
              )}
              {topic.missing > 0 ? (
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-fg-muted">{formatCopy(c.missing, { n: topic.missing })}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-on`} className="flex cursor-pointer items-center gap-2 rounded-md bg-surface-1 px-2 py-1.5">
            <Switch id={`${id}-on`} checked={topic.isActive} onCheckedChange={onToggle} disabled={pending} />
            <span className="text-[length:var(--fs-text-sm)] text-fg">{topic.isActive ? c.active : c.inactive}</span>
          </label>
          <Button variant="ghost" onClick={onUp} disabled={pending || first} aria-label={c.up}>
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" onClick={onDown} disabled={pending || last} aria-label={c.down}>
            <ArrowDown className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="secondary" onClick={onEdit} disabled={pending}>
            <Pencil className="size-4" aria-hidden="true" />
            {c.edit}
          </Button>
          <Button variant="ghost" onClick={onDelete} disabled={pending} className="text-err">
            <Trash2 className="size-4" aria-hidden="true" />
            {c.remove}
          </Button>
        </div>
      </div>
    </li>
  );
}

function TopicForm({
  detail,
  initial,
  pending,
  onCancel,
  onSave,
}: {
  detail: AdminChallengeTopics;
  initial?: AdminChallengeTopic;
  pending: boolean;
  onCancel: () => void;
  onSave: (draft: Draft) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>({
    title: initial?.title ?? '',
    sectionIds: initial?.sectionIds ?? [],
    lessonIds: initial?.lessonIds ?? [],
    isActive: initial?.isActive ?? true,
  });
  const [tried, setTried] = useState(false);

  // نفس حساب السيرفر: الدروس اللي في الوحدات المتعلّمة، والدروس المتعلّمة لوحدها.
  const ready = useMemo(() => {
    let sum = 0;
    for (const section of detail.sections) {
      const whole = draft.sectionIds.includes(section.id);
      for (const lesson of section.lessons) if (whole || draft.lessonIds.includes(lesson.id)) sum += lesson.ready;
    }
    return sum;
  }, [detail.sections, draft.sectionIds, draft.lessonIds]);

  const title = draft.title.trim();
  const empty = draft.sectionIds.length + draft.lessonIds.length === 0;
  const toggle = (key: 'sectionIds' | 'lessonIds', value: string, on: boolean) =>
    setDraft((current) => ({
      ...current,
      [key]: on ? [...current[key], value] : current[key].filter((existing) => existing !== value),
    }));

  const submit = () => {
    setTried(true);
    if (!title || empty) return;
    onSave({ ...draft, title });
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border-2 border-[color:var(--viz-3)] bg-surface-2 p-4" aria-labelledby={`${id}-name`}>
      <div className="flex flex-col gap-1.5">
        <label id={`${id}-name`} htmlFor={`${id}-title`} className="text-[length:var(--fs-text-sm)] font-semibold text-fg">
          {c.nameLabel}
        </label>
        <Input
          id={`${id}-title`}
          value={draft.title}
          maxLength={80}
          placeholder={c.namePlaceholder}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        />
        {tried && !title ? <p className="text-[length:var(--fs-text-xs)] text-err">{c.needName}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.scopeLabel}</p>
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.scopeHint}</p>
        <div className="grid gap-2 md:grid-cols-2">
          {detail.sections.map((section) => {
            const whole = draft.sectionIds.includes(section.id);
            const box = `${id}-s-${section.id}`;
            return (
              <fieldset key={section.id} className={cn('rounded-md border p-2', whole ? 'border-[color:var(--viz-3)] bg-[color-mix(in_oklab,var(--viz-3)_8%,var(--color-surface-1))]' : 'border-line bg-surface-1')}>
                <legend className="sr-only">{section.title}</legend>
                <label htmlFor={box} className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-3">
                  <Checkbox id={box} checked={whole} onCheckedChange={(state) => toggle('sectionIds', section.id, state === true)} />
                  <Layers className="size-4 text-fg-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-medium text-fg [overflow-wrap:anywhere]">{section.title}</span>
                  <span className="shrink-0 text-[length:var(--fs-text-xs)] text-fg-muted">{c.wholeUnit} · {section.ready}</span>
                </label>
                <div className="ms-6 mt-1 flex flex-col">
                  {section.lessons.map((lesson) => {
                    const lessonBox = `${id}-l-${lesson.id}`;
                    return (
                      <label
                        key={lesson.id}
                        htmlFor={lessonBox}
                        className={cn('flex items-center gap-2 rounded-sm px-1 py-1', whole ? 'opacity-60' : 'cursor-pointer hover:bg-surface-3')}
                      >
                        <Checkbox
                          id={lessonBox}
                          checked={whole || draft.lessonIds.includes(lesson.id)}
                          disabled={whole}
                          onCheckedChange={(state) => toggle('lessonIds', lesson.id, state === true)}
                        />
                        <span className="min-w-0 flex-1 text-[length:var(--fs-text-sm)] text-fg [overflow-wrap:anywhere]">{lesson.title}</span>
                        <span className="shrink-0 text-[length:var(--fs-text-xs)] text-fg-muted">
                          {formatCopy(c.lessonReady, { n: lesson.ready })}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
        {tried && empty ? <p className="text-[length:var(--fs-text-xs)] text-err">{c.needScope}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`${id}-active`} className="flex cursor-pointer items-center gap-2">
          <Switch id={`${id}-active`} checked={draft.isActive} onCheckedChange={(isActive) => setDraft((current) => ({ ...current, isActive }))} />
          <span className="text-[length:var(--fs-text-sm)] text-fg">{draft.isActive ? c.activeHint : c.inactiveHint}</span>
        </label>
        <span className="rounded-full bg-[color-mix(in_oklab,var(--viz-3)_20%,transparent)] px-2.5 py-1 text-[length:var(--fs-text-sm)] font-semibold text-fg">
          {formatCopy(c.readyTotal, { n: ready })}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? c.saving : initial ? c.save : c.create}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          <X className="size-4" aria-hidden="true" />
          {c.cancel}
        </Button>
      </div>
    </section>
  );
}
