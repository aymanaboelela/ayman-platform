import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Award, Clock, Layers, Target } from 'lucide-react';
import {
  ActivityFeedSchema,
  ProfileMeSchema,
  StudentQuizHistorySchema,
  TaxonomySchema,
  copy,
} from '@ayman/contracts';
import { Skeleton } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { apiGet } from '@/lib/api';
import { getDashboard } from '@/lib/dashboard';
import { summarise } from '@/lib/dashboard-view';
import { getSession } from '@/lib/session';
import { StatTile } from '@/components/dashboard/stat-tile';
import { ActivityFeed } from '@/components/profile/activity-feed';
import { AvatarForm } from '@/components/profile/avatar-form';
import { DevicesList } from '@/components/settings/devices-list';
import { QuizScoreBars } from '@/components/profile/quiz-score-bars';
import { ScoreTrend } from '@/components/results/score-trend';

export const metadata: Metadata = { title: copy.profile.title };

const c = copy.profile;

/**
 * The student's own profile: who they are, a photo they can change, what they
 * have earned, which devices their account is open on, and what they actually
 * did and when.
 *
 * ## Four independent Suspense boundaries
 *
 * Identity, totals and activity are separate async reads, and each streams on
 * its own. A slow activity query must not hold up the avatar — this is the
 * same rule the shell follows for the rail and the account menu, and the
 * reason `(app)/layout.tsx` is not allowed to `await` anything.
 *
 * Devices are the exception in the other direction: `<DevicesList>` is a
 * client component that owns its own fetch, because the list is mutable from
 * the page (revoking a device) and re-rendering the server tree for that would
 * be a round trip to change one row.
 *
 * ## No new summary endpoint
 *
 * The totals come from the two endpoints that already own them —
 * `/api/me/dashboard` and `/api/me/quizzes`. A third endpoint restating
 * figures two others compute is a third place for them to disagree.
 */
export default function ProfilePage() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
      </header>

      <Suspense fallback={<IdentitySkeleton />}>
        <Identity />
      </Suspense>

      <section className="mb-8">
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium text-fg">{c.earnedTitle}</h2>
        <Suspense fallback={<TotalsSkeleton />}>
          <Totals />
        </Suspense>
      </section>

      {/*
        Its own boundary, and the fifth on this page. `/api/me/quizzes` is the
        slowest read here — it aggregates every attempt the student has ever
        submitted — and holding the activity feed behind it would make the
        whole lower half of the page wait on a chart.
      */}
      <section className="mb-8">
        <h2 className="mb-1 text-[length:var(--fs-title-3)] font-medium text-fg">
          {c.chartsTitle}
        </h2>
        <p className="mb-4 text-[length:var(--fs-text-sm)] text-fg-muted">{c.chartsSubtitle}</p>
        <Suspense fallback={<ChartsSkeleton />}>
          <Charts />
        </Suspense>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <h2 className="mb-1 text-[length:var(--fs-title-3)] font-medium text-fg">
            {c.activityTitle}
          </h2>
          <p className="mb-4 text-[length:var(--fs-text-sm)] text-fg-muted">{c.activitySubtitle}</p>
          <Suspense fallback={<ActivitySkeleton />}>
            <Activity />
          </Suspense>
        </section>

        <aside>
          <h2 className="mb-1 text-[length:var(--fs-title-3)] font-medium text-fg">
            {c.devicesTitle}
          </h2>
          <p className="mb-4 text-[length:var(--fs-text-sm)] text-fg-muted">{c.devicesSubtitle}</p>
          <DevicesList />
        </aside>
      </div>
    </main>
  );
}

/** Name, email, photo, and the onboarding facts. */
async function Identity() {
  /*
    The taxonomy joins the two reads that were already here.

    `/api/profile/me` returns the raw `student_profiles` row, so the
    governorate is a two-character CODE and the year is a bare integer. Rendered
    straight, this card told a student from Cairo that their governorate was
    "01" and that they were in year "2" — true, and useless. `/api/taxonomy` is
    the same public, cached list the onboarding form already resolves these
    against, so the names come from one table rather than a second copy.
  */
  const [session, me, taxonomy] = await Promise.all([
    getSession(),
    apiGetAuthed('/api/profile/me', ProfileMeSchema),
    apiGet('/api/taxonomy', TaxonomySchema),
  ]);

  if (!session) return null;

  const profile = me.profile;
  const governorate =
    taxonomy.governorates.find(
      (item: { code: string; nameAr: string }) => item.code === profile?.governorateCode,
    )?.nameAr ?? null;

  return (
    <section className="panel mb-8 p-5 sm:p-6">
      <AvatarForm name={session.name} image={session.image} />

      <dl className="mt-6 grid gap-4 border-t border-line-subtle pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={c.fieldPhone} value={profile?.phone ?? null} ltr />
        <Field label={c.fieldSchool} value={profile?.schoolName ?? null} />
        <Field label={c.fieldGovernorate} value={governorate} />
        <Field label={c.fieldYear} value={yearLabel(profile?.year ?? null)} />
      </dl>
    </section>
  );
}

/**
 * `ltr` is for the phone number. An Egyptian mobile is a Latin-digit string
 * whose leading zero and grouping must not be reordered by the RTL paragraph
 * direction, but it still sits against the inline-start edge like every other
 * value in the grid — the same treatment the account menu gives an email.
 */
/** 1 → الصف الأول الثانوي. Three values, so a table rather than a rule —
 *  Arabic ordinals are not derivable from the digit. */
function yearLabel(year: number | null): string | null {
  if (year === null) return null;
  const ordinal = { 1: 'الأول', 2: 'الثاني', 3: 'الثالث' }[year];
  return ordinal ? `الصف ${ordinal} الثانوي` : String(year);
}

function Field({ label, value, ltr }: { label: string; value: string | null; ltr?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[length:var(--fs-mono-label)] text-fg-muted">{label}</dt>
      <dd
        dir={ltr ? 'ltr' : undefined}
        className={`truncate text-start text-[length:var(--fs-text-sm)] ${
          value ? 'text-fg' : 'text-fg-faint'
        }`}
      >
        {value ?? c.fieldNotSet}
      </dd>
    </div>
  );
}

/**
 * Watch time comes from the activity feed's own sittings rather than from
 * `lesson_progress`, so the figure and the timeline below it are derived from
 * the same rows — a total that disagrees with the list under it is worse than
 * no total.
 *
 * It is therefore a total over the FIRST PAGE of activity, not over all
 * history. That is a deliberate limit, not an oversight: summing every sitting
 * a student has ever had needs its own aggregate query, and this slice ships
 * no fourth endpoint. Labelled as study time, which is what the first page
 * honestly represents for a screen read in a session.
 */
async function Totals() {
  const [dashboard, quizzes] = await Promise.all([
    getDashboard(),
    apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema),
  ]);

  const { completedLessons, totalLessons } = summarise(dashboard);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatTile
        icon={<Layers className="size-4" />}
        value={completedLessons}
        suffix={totalLessons > 0 ? `/ ${totalLessons}` : undefined}
        label={c.statLessons}
        meterPercent={totalLessons > 0 ? (completedLessons / totalLessons) * 100 : undefined}
        hue={165}
      />
      <StatTile
        icon={<Award className="size-4" />}
        value={quizzes.summary.passedCount}
        suffix={`/ ${quizzes.summary.quizzesTaken}`}
        label={c.statQuizzesPassed}
        meterPercent={
          quizzes.summary.quizzesTaken > 0
            ? (quizzes.summary.passedCount / quizzes.summary.quizzesTaken) * 100
            : undefined
        }
        accent
      />
      <StatTile
        icon={<Target className="size-4" />}
        value={quizzes.summary.averagePercent ?? c.noneYet}
        suffix={quizzes.summary.averagePercent === null ? undefined : '%'}
        label={c.statAverage}
        hue={295}
      />
      <Suspense
        fallback={
          <StatTile icon={<Clock className="size-4" />} value="…" label={c.statWatchTime} hue={225} />
        }
      >
        <WatchTimeTile />
      </Suspense>
    </div>
  );
}

async function WatchTimeTile() {
  const feed = await apiGetAuthed('/api/me/activity?limit=50', ActivityFeedSchema);
  const seconds = feed.entries.reduce(
    (sum, entry) => sum + (entry.kind === 'watched' ? entry.secondsWatched : 0),
    0,
  );
  const minutes = Math.round(seconds / 60);

  return (
    <StatTile
      icon={<Clock className="size-4" />}
      value={minutes >= 60 ? Math.floor(minutes / 60) : minutes}
      suffix={minutes >= 60 ? 'س' : 'د'}
      label={c.statWatchTime}
      hue={225}
    />
  );
}

/**
 * Both charts, from ONE read.
 *
 * `/api/me/quizzes` returns `series` (every submitted attempt, oldest first —
 * its own contract comment says "the chart plots it in order") and `quizzes`
 * (one row per quiz). Two charts, one endpoint, and no truncation: unlike the
 * activity feed, which is a paginated window, this returns the student's whole
 * history — so neither chart can quietly draw a partial picture.
 *
 * `ScoreTrend` is the same component `/results` renders. It needs two points
 * to be a trend at all, so a student with a single attempt gets the per-quiz
 * bars alone rather than a line between one dot and nothing.
 */
async function Charts() {
  const history = await apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema);

  if (history.series.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-surface-2 px-6 py-8 text-center text-fg-muted">
        {c.chartsEmpty}
      </p>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {history.series.length > 1 ? <ScoreTrend series={history.series} /> : null}
      <QuizScoreBars rows={history.quizzes} />
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {Array.from({ length: 2 }, (_, index) => (
        <div className="panel space-y-4 p-5" key={index}>
          <Skeleton width="narrow" className="h-5" />
          <Skeleton className="h-40" />
        </div>
      ))}
    </div>
  );
}

async function Activity() {
  const feed = await apiGetAuthed('/api/me/activity', ActivityFeedSchema);
  return <ActivityFeed initialEntries={feed.entries} initialCursor={feed.nextCursor} />;
}

function IdentitySkeleton() {
  return (
    <div className="panel mb-8 space-y-5 p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-[72px] rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton width="narrow" className="h-4" />
          <Skeleton width="wide" className="h-3" />
        </div>
      </div>
      <div className="grid gap-4 border-t border-line-subtle pt-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} width={i % 2 === 0 ? 'wide' : 'narrow'} className="h-8" />
        ))}
      </div>
    </div>
  );
}

function TotalsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="panel space-y-3 p-4">
          <Skeleton width="narrow" className="h-7" />
          <Skeleton width={i % 2 === 0 ? 'narrow' : 'wide'} className="h-4" />
        </div>
      ))}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="panel overflow-hidden">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-line-subtle p-4 last:border-b-0">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton width={i % 2 === 0 ? 'wide' : 'narrow'} className="h-4" />
            <Skeleton width="narrow" className="h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
