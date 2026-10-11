import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpenCheck, ChevronRight, Info, Layers, Library, Sparkles, Swords } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { AdminChallengeTopicsSchema } from '@ayman/contracts/quiz/challenges';
import { GameBankDetailSchema } from '@ayman/contracts/quiz/game';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { num } from '@/components/admin/charts/format';
import { adminGetOrNotFound, adminGetOrNull } from '@/lib/admin-api';
import { ChallengeTopics } from './challenge-topics';
import { BankRow } from './lesson-bank-row';
import { ModesForm } from './modes-form';

const c = copy.admin.games;

export const metadata: Metadata = { title: c.title };

/**
 * كورس واحد في «أسئلة الألعاب»: الأسئلة العامة، وأسئلة كل درس، وكل لعبة
 * بتسحب منين.
 *
 * الدرس هنا زي ما الطالب بيشوفه في «الأسئلة من ← درس»: المحاضرة، ومعاها
 * أسئلة الكويز اللي بعدها. الكويز اللي أسئلته محسوبة على محاضرة مالوش صف
 * لوحده؛ الامتحانات (مالهاش محاضرة قبلها) ليها صف.
 */
export default async function GameCourseBankPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const [detail, challenges] = await Promise.all([
    adminGetOrNotFound(`/api/admin/game-banks/${encodeURIComponent(courseId)}`, GameBankDetailSchema),
    // `OrNull`: API من البيلد اللي قبله (لسه مافيهوش التحديات) مايوقّعش الصفحة كلها.
    adminGetOrNull(`/api/admin/challenge-topics/${encodeURIComponent(courseId)}`, AdminChallengeTopicsSchema),
  ]);

  const lessons = detail.sections.flatMap((section) => section.lessons);
  const lessonReady = lessons.reduce((sum, lesson) => sum + lesson.ready, 0);
  const lessonBanks = lessons.filter((lesson) => lesson.ready > 0).length;

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <Link
        href="/admin/games"
        className="mb-3 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
        {c.back}
      </Link>
      <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg [overflow-wrap:anywhere]">{detail.courseTitle}</h1>
      <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.detailLead}</p>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={c.generalTitle} value={num(detail.general.ready)} tint="var(--viz-2)" />
        <StatTile
          label={c.lessonsTitle}
          value={num(lessonReady)}
          context={formatCopy(c.lessonsReady, { n: num(lessonReady), lessons: num(lessonBanks) })}
          tint="var(--viz-5)"
        />
        <StatTile label={c.useQuizzes} value={num(detail.quizQuestions)} context={c.useQuizzesHint} tint="var(--viz-4)" />
        <StatTile
          label={c.lessonsWithBank}
          value={num(lessonBanks)}
          context={formatCopy(c.ofLessons, { n: num(lessons.length) })}
          tint="var(--viz-3)"
          accent
        />
      </section>

      {challenges ? (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-[length:var(--fs-title-3)] font-semibold text-fg">
            <Swords className="size-5 text-[color:var(--viz-1)]" aria-hidden="true" />
            {copy.admin.challenges.title}
          </h2>
          <p className="mb-3 mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{copy.admin.challenges.lead}</p>
          <ChallengeTopics key={challenges.topics.map((topic) => topic.id).join()} initial={challenges} />
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-[length:var(--fs-title-3)] font-semibold text-fg">
          <Library className="size-5 text-[color:var(--viz-2)]" aria-hidden="true" />
          {c.generalTitle}
        </h2>
        <p className="mb-3 mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.generalHint}</p>
        <ul>
          <BankRow courseId={detail.courseId} general={detail.general} />
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-[length:var(--fs-title-3)] font-semibold text-fg">
          <BookOpenCheck className="size-5 text-[color:var(--viz-5)]" aria-hidden="true" />
          {c.lessonsTitle}
        </h2>
        <p className="mb-1 mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lessonsHint}</p>
        <p className="mb-3 flex items-start gap-1.5 text-[length:var(--fs-text-xs)] text-fg-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {formatCopy(c.quizTotal, { n: num(detail.quizQuestions) })} — {c.quizTotalHint}
        </p>
        {detail.sections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-fg-muted">{c.noLessons}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {detail.sections.map((section) => (
              <div key={section.id} className="rounded-lg border border-line bg-surface-2 p-3 sm:p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-fg">
                  <Layers className="size-4 text-fg-muted" aria-hidden="true" />
                  <span className="[overflow-wrap:anywhere]">{section.title}</span>
                </h3>
                <ul className="flex flex-col gap-2">
                  {section.lessons.map((lesson) => (
                    <BankRow key={lesson.id} courseId={detail.courseId} lesson={lesson} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-[length:var(--fs-title-3)] font-semibold text-fg">
          <Sparkles className="size-5 text-[color:var(--viz-3)]" aria-hidden="true" />
          {c.modesTitle}
        </h2>
        <p className="mb-3 mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.modesHint}</p>
        <ModesForm detail={detail} />
      </section>
    </div>
  );
}
