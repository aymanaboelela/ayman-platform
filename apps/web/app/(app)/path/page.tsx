import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { LearningPathSchema, copy, type LearningPath } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { PathTimeline } from '@/components/path/path-timeline';
import { PathSide } from '@/components/path/path-side';
import { bandExam, getStudentExamsOrEmpty } from '@/lib/exams';
import { ProgressRing } from '@/components/progress-ring';
import '@/components/path/path.css';

const c = copy.path;

export const metadata: Metadata = { title: c.title };

/**
 * The learning path: every enrolled course as an ordered run of nodes, each
 * drawn in the lock state the lesson routes actually enforce.
 *
 * The lock here is a RENDER of a server decision, never the decision itself.
 * Removing it in devtools buys nothing — `/courses/../lessons/..` re-derives
 * the gate on every request and 404s a locked lesson.
 */
export default async function PathPage() {
  const [path, exams] = await Promise.all([
    apiGetAuthed('/api/me/path', LearningPathSchema),
    getStudentExamsOrEmpty(),
  ]);
  const exam = bandExam(exams.exams);

  if (path.courses.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[var(--w-app)] px-6 py-10 md:py-12">
        <header className="study-head">
          <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
          <h1 className="study-head__title">{c.title}</h1>
        </header>
        {/* Ember-tinted, like every other empty state in the study surface: a
            container waiting to be filled is structure, and a dashed neutral
            box is indistinguishable from something that failed to load. The
            amber button on it is still the one action. */}
        <div className="rounded-lg border border-study-line bg-study-tint px-6 py-10 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          <Link
            href="/library"
            className={cn(
              'mt-5 inline-flex h-10 items-center rounded-sm bg-accent px-4',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
            )}
          >
            {c.emptyCta}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-8 md:py-10">

      {/*
        «إنت فين» — هيرو ملوّن مش شريط.

        كان شريط مصبوغ خفيف بـ«٤ من ١٧» وبار رفيع، وده بالظبط الشكل اللي
        بيتقري تقرير مش مشوار. دلوقتي نفس لغة «ترتيبي»: جريدينت زاهي، نسبة كبيرة
        بتتعدّ، طريق مرسوم بيتملى لحد نسبتك، وزرار واحد: «نكمّل» على الدرس اللي
        عليه الدور. ده أهم سطر في الصفحة، فبقى أول حاجة.
      */}
      <PathHero path={path} />

      {/* The courses as one timeline — a card each, only the current one
          open to the few lectures around what is next. See `PathTimeline`. */}
      {/* The timeline beside a narrow side column — the first-round design
          the owner picked: «اللي جاي» and the month's exam at the side,
          stacked under the timeline on a phone. */}
      <div className="pth-layout">
        <PathTimeline path={path} />
        <PathSide path={path} exam={exam} />
      </div>
    </main>
  );
}

function PathHero({ path }: { path: LearningPath }) {
  const summary = c.summary
    .replace('{cleared}', String(path.clearedLessons))
    .replace('{total}', String(path.totalLessons))
    .replace('{courses}', String(path.courses.length));
  const left = Math.max(0, path.totalLessons - path.clearedLessons);

  // الدرس اللي عليه الدور: نفس اللي المحطة المليانة في الخريطة بتشاور عليه.
  // كورس مقفول مؤقتًا مالوش زرار — الدرس جوّاه بيرجّع 404.
  const course = path.courses.find((entry) => entry.id === path.currentCourseId);
  const next = course?.published ? course.nodes.find((node) => node.id === course.nextLessonId) : undefined;

  /*
   * One row, from the first-round design: the ring, what this page is and
   * how far along, and the one button. It was a tall band with a count-up,
   * a bar, two chips and an illustration — five ways of saying the same
   * number before the first course appeared.
   */
  return (
    <section className="pth-hero mb-6">
      <ProgressRing percent={path.percent} size={76} tone="ink">
        <span className="pth-hero__ring">{Math.round(path.percent)}%</span>
      </ProgressRing>

      <div className="pth-hero__copy">
        <h1 className="pth-hero__title">{c.title}</h1>
        <p className="pth-hero__summary">
          {summary}
          {' · '}
          {left > 0 ? c.heroLeft.replace('{n}', String(left)) : c.heroAllDone}
        </p>
        <span className="sr-only">{c.percentComplete.replace('{percent}', String(path.percent))}</span>
      </div>

      {next && course ? (
        <Link href={`/courses/${course.slug}/lessons/${next.lessonId}`} className="pth-hero__cta">
          <span className="min-w-0 truncate">{c.heroNext.replace('{title}', next.title)}</span>
          <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}
