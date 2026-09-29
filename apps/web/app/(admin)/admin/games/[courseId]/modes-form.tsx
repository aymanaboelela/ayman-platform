'use client';

import { useId, useState, useTransition, type CSSProperties } from 'react';
import { Crown, HeartPulse, Lock, Save, Zap } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  GAME_MODES,
  gameModeOpen,
  type GameBankDetail,
  type GameMode,
  type GameModeConfig,
  type GameModesConfig,
} from '@ayman/contracts/quiz/game';
import { Button } from '@ayman/ui/components/button';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import { saveGameModesAction } from '../actions';

const c = copy.admin.games;

const MODE_META: Record<GameMode, { title: string; icon: typeof Crown; tone: string }> = {
  millionaire: { title: c.modeMillionaire, icon: Crown, tone: 'var(--viz-3)' },
  race: { title: c.modeRace, icon: Zap, tone: 'var(--viz-4)' },
  survival: { title: c.modeSurvival, icon: HeartPulse, tone: 'var(--viz-2)' },
};

/** المليون أول، زي صفحة الطالب. */
const ORDER: GameMode[] = ['millionaire', 'race', 'survival'];

/**
 * «كل لعبة بتسحب منين» — التلات ألعاب في فورم واحد وحفظة واحدة.
 *
 * لكل لعبة: أسئلة الكويزات (اللي الطالب امتحنها)، أسئلة الألعاب (العامة
 * والدروس)، وكل الدروس ولا دروس معيّنة. الافتراضي — الاتنين وكل الدروس — هو
 * نفس اللي كان قبل الشاشة دي بالظبط.
 */
export function ModesForm({ detail }: { detail: GameBankDetail }) {
  const [modes, setModes] = useState<GameModesConfig>(detail.modes);
  const [saved, setSaved] = useState<GameModesConfig>(detail.modes);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(modes) !== JSON.stringify(saved);

  const lessons = detail.sections.flatMap((section) =>
    section.lessons.map((lesson) => ({ ...lesson, sectionTitle: section.title })),
  );

  const patch = (mode: GameMode, next: Partial<GameModeConfig>) => {
    setStatus('idle');
    setModes((current) => ({ ...current, [mode]: { ...current[mode], ...next } }));
  };

  const save = () =>
    start(async () => {
      const result = await saveGameModesAction(detail.courseId, modes);
      if (!result.ok) {
        setStatus('failed');
        return;
      }
      setModes(result.modes);
      setSaved(result.modes);
      setStatus('saved');
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 xl:grid-cols-3">
        {ORDER.filter((mode) => GAME_MODES.includes(mode)).map((mode) => (
          <ModeCard
            key={mode}
            mode={mode}
            config={modes[mode]}
            lessons={lessons}
            onChange={(next) => patch(mode, next)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending || !dirty}>
          <Save className="size-4" aria-hidden="true" />
          {pending ? c.saving : c.save}
        </Button>
        <p
          role="status"
          className={cn(
            'text-[length:var(--fs-text-sm)]',
            status === 'failed' ? 'text-err' : status === 'saved' && !dirty ? 'text-ok' : 'text-fg-muted',
          )}
        >
          {status === 'failed' ? c.saveFailed : dirty ? c.unsaved : status === 'saved' ? c.saved : ''}
        </p>
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  config,
  lessons,
  onChange,
}: {
  mode: GameMode;
  config: GameModeConfig;
  lessons: Array<GameBankDetail['sections'][number]['lessons'][number] & { sectionTitle: string }>;
  onChange: (next: Partial<GameModeConfig>) => void;
}) {
  const meta = MODE_META[mode];
  const id = useId();
  const specific = config.lessonIds.length > 0;
  const [picking, setPicking] = useState(specific);
  const open = gameModeOpen(config);

  const toggleLesson = (lessonId: string, on: boolean) => {
    const next = on ? [...config.lessonIds, lessonId] : config.lessonIds.filter((existing) => existing !== lessonId);
    onChange({ lessonIds: next });
  };

  const bySection = new Map<string, typeof lessons>();
  for (const lesson of lessons) bySection.set(lesson.sectionTitle, [...(bySection.get(lesson.sectionTitle) ?? []), lesson]);

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-line p-4"
      style={
        {
          '--tone': meta.tone,
          background: 'linear-gradient(160deg, color-mix(in oklab, var(--tone) 12%, var(--color-surface-2)), var(--color-surface-2) 55%)',
        } as CSSProperties
      }
      aria-labelledby={`${id}-title`}
    >
      <header className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-md bg-[color-mix(in_oklab,var(--tone)_22%,transparent)] text-[color:var(--tone)]">
          <meta.icon className="size-5" aria-hidden="true" />
        </span>
        <h3 id={`${id}-title`} className="font-semibold text-fg">
          {meta.title}
        </h3>
        {!open ? (
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--err)_16%,transparent)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-err">
            <Lock className="size-3" aria-hidden="true" />
            {c.modeOff}
          </span>
        ) : null}
      </header>

      <SourceToggle
        id={`${id}-quizzes`}
        label={c.useQuizzes}
        hint={c.useQuizzesHint}
        checked={config.useQuizzes}
        onChange={(on) => onChange({ useQuizzes: on })}
      />
      <SourceToggle
        id={`${id}-bank`}
        label={c.useBank}
        hint={c.useBankHint}
        checked={config.useBank}
        onChange={(on) => onChange({ useBank: on })}
      />

      <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-surface-1 p-1" role="radiogroup">
        {[false, true].map((some) => (
          <button
            key={String(some)}
            type="button"
            role="radio"
            aria-checked={picking === some}
            onClick={() => {
              setPicking(some);
              if (!some) onChange({ lessonIds: [] });
            }}
            className={cn(
              'rounded-sm px-2 py-1.5 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms]',
              picking === some ? 'bg-accent font-semibold text-[color:var(--n-1)]' : 'text-fg-muted hover:bg-surface-3',
            )}
          >
            {some ? c.lessonsSome : c.lessonsAll}
          </button>
        ))}
      </div>

      {picking ? (
        <div className="flex flex-col gap-2">
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
            {config.lessonIds.length > 0 ? formatCopy(c.lessonsPicked, { n: config.lessonIds.length }) : c.lessonsPickEmpty}
            {' · '}
            {c.lessonsSomeHint}
          </p>
          <div className="max-h-64 overflow-y-auto rounded-md border border-line bg-surface-1 p-2">
            {[...bySection.entries()].map(([sectionTitle, sectionLessons]) => (
              <fieldset key={sectionTitle} className="mb-2 last:mb-0">
                <legend className="mb-1 text-[length:var(--fs-text-xs)] font-semibold text-fg-muted">{sectionTitle}</legend>
                {sectionLessons.map((lesson) => {
                  const box = `${id}-${lesson.id}`;
                  return (
                    <label key={lesson.id} htmlFor={box} className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface-3">
                      <Checkbox
                        id={box}
                        checked={config.lessonIds.includes(lesson.id)}
                        onCheckedChange={(state) => toggleLesson(lesson.id, state === true)}
                      />
                      <span className="min-w-0 flex-1 text-[length:var(--fs-text-sm)] text-fg [overflow-wrap:anywhere]">
                        {lesson.title}
                      </span>
                      <span className="shrink-0 text-[length:var(--fs-text-xs)] text-fg-muted">
                        {lesson.quizQuestions + lesson.ready}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SourceToggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-1 px-3 py-2">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[length:var(--fs-text-sm)] font-medium text-fg">{label}</span>
        <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">{hint}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
