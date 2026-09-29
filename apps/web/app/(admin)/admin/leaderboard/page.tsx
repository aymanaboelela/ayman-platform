import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import Form from 'next/form';
import {
  ArrowLeft,
  CalendarCheck2,
  ClipboardCheck,
  Clock,
  Crown,
  Gem,
  Hourglass,
  ListOrdered,
  Medal,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  AdminLeaderboardSchema,
  LeaderboardQuerySchema,
  type AdminLeaderboard,
  type LeaderboardQuery,
  type LeaderboardStudent,
} from '@ayman/contracts/admin/leaderboard';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { RANK_LEVELS, levelFor } from '@ayman/contracts/rank';
import { ListControl, ListPager } from '@/components/admin/list-controls';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { UserAvatar } from '@/components/app/user-avatar';
import { LevelGem, RankArt } from '@/components/rank/rank-art';
import { adminGet } from '@/lib/admin-api';
import '@/components/rank/rank.css';
import './leaderboard.css';

const c = copy.admin.leaderboard;

export const metadata = { title: c.title };

const NUM = new Intl.NumberFormat('en-US');
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `/admin/leaderboard` — «الأوائل»: مين الأوائل في كل دفعة، وكل طالب ترتيبه كام.
 *
 * ## نفس صفحة «ترتيبي»، من فوق
 *
 * الطلب كان «شبه اللي في الداشبورد بتاع الطالب». فالشاشة بتلبس نفس اللغة
 * بالظبط — `rank.css` نفسه، المنصة بالدهب والفضة والبرونز، جواهر المستويات
 * بألوانها — والأرقام من نفس المكان (`CohortRankService`). مدرّس بيبص على
 * الأول هنا وطالب بيبص على «الأوائل على الدفعة» عنده بيشوفوا نفس التلاتة.
 *
 * ⚠️ من غير تنانين: `PodiumDragon` لأيمن بس (`aymanOnly`)، والشاشة دي عند كل
 * المدرّسين. `LevelGem` مش `LevelIcon` لنفس السبب — مايبقاش فيه فرع.
 *
 * ## الرابط هو الحالة
 *
 * الدفعة والبحث وعربي/لغات والصفحة كلهم في الـquery string، زي `/admin/follow-up`:
 * زرار الرجوع بيمشي عليهم، ونتيجة بحث تتبعت لحد تاني. `adminGet` مش كاش —
 * السيرفر عنده كاش خمس دقايق أصلًا، وكاش تاني فوقه كان هيخلّي «آخر تحديث»
 * يكدب.
 *
 * ## جدول على الشاشة العريضة، كروت على الموبايل — بالحاوية مش بالشاشة
 *
 * السايدبار بياخد ٢٦٠px، فـ`md` على الفيوبورت معناها عمود ٤٦٠px. الصف بيقلب
 * جدول بـ`@container` على عرض القسم نفسه (`leaderboard.css`)، ومفيش سكرول
 * عرضي في أي عرض.
 */
export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // `safeParse` مش `parse`: رابط اتلعب فيه يفتح الافتراضي، مش صفحة خطأ.
  const query =
    LeaderboardQuerySchema.safeParse({
      year: one(params.year),
      systemId: one(params.systemId),
      q: one(params.q),
      stream: one(params.stream),
      page: one(params.page),
    }).data ?? LeaderboardQuerySchema.parse({});

  const api = new URLSearchParams({ page: String(query.page), perPage: String(query.perPage) });
  if (query.year !== undefined) api.set('year', String(query.year));
  if (query.systemId) api.set('systemId', query.systemId);
  if (query.q) api.set('q', query.q);
  if (query.stream) api.set('stream', query.stream);

  const board = await adminGet(`/api/admin/leaderboard?${api}`, AdminLeaderboardSchema);
  const cohort = board.cohort;
  const top = board.podium[0];

  return (
    <div className="rk lb">
      <header className="lb-hero" data-level={levelFor(top?.points ?? 0).key}>
        <div className="lb-hero__shapes" aria-hidden="true">
          <span className="lb-shape lb-shape--ring" />
          <span className="lb-shape lb-shape--blob" />
          <span className="lb-shape lb-shape--dot" />
        </div>
        <div className="lb-hero__copy">
          <span className="lb-hero__pill">
            <Medal className="size-3.5" aria-hidden="true" />
            {cohort?.label ? `${c.eyebrow} · ${cohort.label}` : c.eyebrow}
          </span>
          <h1 className="lb-hero__title">{c.title}</h1>
          <p className="lb-hero__lead">{c.lead}</p>
          {cohort ? (
            <p className="lb-hero__live">
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {freshness(cohort.computedAt)}
            </p>
          ) : null}
        </div>
        <div className="lb-hero__art">
          <RankArt level={levelFor(top?.points ?? 0).key} />
        </div>
      </header>

      {board.cohorts.length > 0 ? <CohortTabs board={board} /> : null}

      {cohort === null ? (
        <p className="lb-empty">{c.emptyAll}</p>
      ) : (
        <>
          <section className="lb-stats">
            <Stat hue="viz-5" icon={<Users className="size-5" />} value={NUM.format(cohort.size)} label={c.statSize} />
            <Stat
              hue="viz-4"
              icon={<Zap className="size-5" />}
              value={NUM.format(cohort.active)}
              label={c.statActive}
              note={
                cohort.size > 0
                  ? formatCopy(c.statActiveHint, { percent: Math.round((cohort.active / cohort.size) * 100) })
                  : undefined
              }
              meter={cohort.size > 0 ? (cohort.active / cohort.size) * 100 : undefined}
            />
            <Stat
              hue="viz-2"
              icon={<TrendingUp className="size-5" />}
              value={NUM.format(Math.round(cohort.averagePoints))}
              label={c.statAverage}
              note={top ? `${c.statTop}: ${NUM.format(top.points)}` : undefined}
            />
            <Stat
              hue="gold"
              icon={<Hourglass className="size-5" />}
              value={NUM.format(cohort.pendingReview)}
              label={c.statPending}
              note={cohort.pendingReview > 0 ? c.statPendingHint : c.statPendingNone}
              href={cohort.pendingReview > 0 ? '/admin/grading' : undefined}
            />
          </section>

          <section className="lb-duo">
            <Podium podium={board.podium} />
            <Levels levels={cohort.levels} size={cohort.size} />
          </section>

          <Board board={board} query={query} />
        </>
      )}

      {board.unplaced > 0 ? (
        <p className="lb-footnote">{formatCopy(c.unplaced, { n: NUM.format(board.unplaced) })}</p>
      ) : null}
    </div>
  );
}

function CohortTabs({ board }: { board: AdminLeaderboard }) {
  return (
    <nav className="lb-tabs" aria-label={c.cohortsLabel}>
      {board.cohorts.map((tab) => {
        const current = board.cohort?.year === tab.year && board.cohort.systemId === tab.systemId;
        const href = `/admin/leaderboard?${new URLSearchParams({
          year: String(tab.year),
          ...(tab.systemId ? { systemId: tab.systemId } : {}),
        })}`;
        return (
          <Link
            key={`${tab.systemId ?? '-'}:${tab.year}`}
            href={href}
            className="lb-tab"
            data-year={Math.min(tab.year, 3)}
            data-empty={tab.size === 0 || undefined}
            aria-current={current ? 'page' : undefined}
          >
            <span className="lb-tab__label">{tab.label}</span>
            <span className="lb-tab__count">{NUM.format(tab.size)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Stat({
  hue,
  icon,
  value,
  label,
  note,
  meter,
  href,
}: {
  hue: 'viz-2' | 'viz-4' | 'viz-5' | 'gold';
  icon: ReactNode;
  value: string;
  label: string;
  note?: string;
  meter?: number;
  href?: string;
}) {
  const body = (
    <>
      <span className="lb-stat__well" aria-hidden="true">
        {icon}
      </span>
      <span className="lb-stat__body">
        <span className="lb-stat__value">{value}</span>
        <span className="lb-stat__label">{label}</span>
        {note ? <span className="lb-stat__note">{note}</span> : null}
        {meter === undefined ? null : (
          <span className="lb-stat__meter" aria-hidden="true">
            <span style={{ '--lb-fill': `${Math.min(100, Math.max(0, meter))}%` } as CSSProperties} />
          </span>
        )}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="lb-stat lb-stat--link" data-hue={hue}>
      {body}
    </Link>
  ) : (
    <div className="lb-stat" data-hue={hue}>
      {body}
    </div>
  );
}

/**
 * «ملك سعيد ذكي محمد» ← «ملك سعيد» — العمود ضيّق، والاسم كامل في الـtitle وفي
 * القايمة تحت. «عبد» و«أبو» بيتلزقوا في اللي بعدهم زي `shortName` في السيرفر:
 * «مريم عبد الرحمن» مش «مريم عبد».
 */
const NAME_PREFIXES = new Set(['عبد', 'أبو', 'ابو']);

function firstTwo(name: string): string {
  const parts: string[] = [];
  for (const word of name.trim().split(/\s+/)) {
    const last = parts.at(-1);
    if (last !== undefined && NAME_PREFIXES.has(last)) parts[parts.length - 1] = `${last} ${word}`;
    else parts.push(word);
  }
  return parts.slice(0, 2).join(' ');
}

function Podium({ podium }: { podium: LeaderboardStudent[] }) {
  // الأول في النص، التاني على يمينه (أول ما العين تقرا في RTL)، والتالت شمال —
  // نفس ترتيب منصة «ترتيبي».
  const order = [podium[1], podium[0], podium[2]];
  return (
    <div className="rk-card lb-podium-card">
      <h2 className="rk-card__title">
        <Crown className="size-5" aria-hidden="true" />
        {c.podiumTitle}
      </h2>
      {podium.length === 0 ? (
        <p className="rk-empty">{c.podiumEmpty}</p>
      ) : (
        <ol className="rk-podium">
          {order.map((row, slot) =>
            row ? (
              <li
                key={row.userId}
                className="rk-podium__slot"
                data-place={Math.min(row.rank, 3)}
                style={{ '--d': slot } as CSSProperties}
              >
                <Link href={`/admin/students/${row.userId}`} className="lb-podium__who" title={row.fullName}>
                  <span className="lb-podium__face">
                    {row.rank === 1 ? <Crown className="rk-podium__crown" aria-hidden="true" /> : null}
                    <UserAvatar name={row.fullName} image={row.avatar} size={row.rank === 1 ? 68 : 56} />
                  </span>
                  <span className="rk-podium__name">{firstTwo(row.fullName)}</span>
                </Link>
                <span className="rk-podium__points">
                  {NUM.format(row.points)} {c.points}
                </span>
                <span className="rk-podium__pillar">
                  <span className="rk-podium__rank">{row.rank}</span>
                </span>
              </li>
            ) : (
              <li key={`empty-${slot}`} className="rk-podium__slot rk-podium__slot--empty" aria-hidden="true" />
            ),
          )}
        </ol>
      )}
    </div>
  );
}

function Levels({ levels, size }: { levels: NonNullable<AdminLeaderboard['cohort']>['levels']; size: number }) {
  const max = Math.max(1, ...levels.map((level) => level.count));
  return (
    <div className="rk-card lb-levels">
      <h2 className="rk-card__title">
        <Gem className="size-5" aria-hidden="true" />
        {c.levelsTitle}
      </h2>
      <p className="lb-levels__hint">{c.levelsHint}</p>
      <ul className="lb-levels__list">
        {levels.map((level, i) => {
          const meta = RANK_LEVELS.find((entry) => entry.key === level.key);
          return (
            <li
              key={level.key}
              className="lb-level"
              data-level={level.key}
              data-zero={level.count === 0 || undefined}
              style={{ '--d': i } as CSSProperties}
            >
              <LevelGem level={level.key} className="lb-level__gem" />
              <span className="lb-level__name">{meta?.nameAr ?? level.key}</span>
              <span className="lb-level__bar" aria-hidden="true">
                <span style={{ '--lb-fill': `${(level.count / max) * 100}%` } as CSSProperties} />
              </span>
              <span className="lb-level__count">
                {NUM.format(level.count)}
                {size > 0 ? <span className="lb-level__pct">{Math.round((level.count / size) * 100)}%</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Board({
  board,
  query,
}: {
  board: AdminLeaderboard;
  query: LeaderboardQuery;
}) {
  const cohort = board.cohort!;
  const found = query.q && board.rowCount === 1 ? board.rows[0] : undefined;

  return (
    <section className="lb-board">
      <div className="lb-board__head">
        <h2 className="rk-section-title">
          <ListOrdered className="size-5" aria-hidden="true" />
          {c.tableTitle}
        </h2>
        <div className="lb-board__tools">
          {/* GET form: البحث بيتكتب في الرابط زي أي فلتر، والدفعة والفلتر
              بيركبوا معاه hidden عشان البحث مايرجّعش للدفعة الافتراضية. */}
          <Form action="/admin/leaderboard" className="lb-search" role="search">
            <input type="hidden" name="year" value={cohort.year} />
            {cohort.systemId ? <input type="hidden" name="systemId" value={cohort.systemId} /> : null}
            {query.stream ? <input type="hidden" name="stream" value={query.stream} /> : null}
            <label className="lb-search__field">
              <span className="sr-only">{c.searchLabel}</span>
              <Search className="lb-search__icon" aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={query.q}
                maxLength={120}
                placeholder={c.searchPlaceholder}
                className="lb-search__input"
              />
            </label>
            <button type="submit" className="lb-search__go">
              {c.searchSubmit}
            </button>
          </Form>
          <ListControl
            name="stream"
            label={c.streamLabel}
            value={query.stream ?? ''}
            options={[
              { value: '', label: c.streamAll },
              { value: 'general', label: copy.admin.students.streamFilterLabels.general },
              { value: 'languages', label: copy.admin.students.streamFilterLabels.languages },
            ]}
          />
        </div>
      </div>

      {query.q || query.stream ? (
        <p className="lb-results">
          <span>{formatCopy(c.resultsCount, { n: NUM.format(board.rowCount) })}</span>
          <span className="lb-results__note">{c.rankNote}</span>
          {query.q ? (
            <Link
              className="lb-results__clear"
              href={`/admin/leaderboard?${new URLSearchParams({
                year: String(cohort.year),
                ...(cohort.systemId ? { systemId: cohort.systemId } : {}),
                ...(query.stream ? { stream: query.stream } : {}),
              })}`}
            >
              {c.searchClear}
            </Link>
          ) : null}
        </p>
      ) : null}

      {found ? <Found row={found} size={cohort.size} /> : null}

      {board.rows.length === 0 ? (
        <div className="lb-empty">
          {query.q ? (
            <>
              <p>{c.emptySearch}</p>
              <p className="lb-empty__hint">{c.emptySearchHint}</p>
              <Link
                href={`/admin/students?${new URLSearchParams({ q: query.q })}`}
                className="lb-btn lb-btn--accent"
              >
                {c.emptySearchCta}
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <p>{c.emptyCohort}</p>
          )}
        </div>
      ) : (
        <div className="lb-table">
          <div className="lb-thead" aria-hidden="true">
            <span>{c.columnRank}</span>
            <span>{c.columnStudent}</span>
            <span>{c.columnPoints}</span>
            <span>{c.columnQuizzes}</span>
            <span>{c.columnExams}</span>
            <span>{c.columnHomework}</span>
            <span>{c.columnLastActive}</span>
            <span />
          </div>
          <ol className="lb-list">
            {board.rows.map((row, i) => (
              <Row key={row.userId} row={row} index={i} />
            ))}
          </ol>
        </div>
      )}

      <ListPager
        page={query.page}
        perPage={query.perPage}
        rowCount={board.rowCount}
        labels={{
          previous: copy.admin.books.pagerPrevious,
          next: copy.admin.books.pagerNext,
          of: copy.admin.books.pagerOf,
        }}
      />
    </section>
  );
}

/** نتيجة بحث واحدة = إجابة «ترتيبه كام؟» في سطر كبير، قبل الجدول. */
function Found({ row, size }: { row: LeaderboardStudent; size: number }) {
  const place = row.rank <= 3 && row.points > 0 ? row.rank : undefined;
  return (
    <div className="lb-found" data-place={place}>
      <UserAvatar name={row.fullName} image={row.avatar} size={56} />
      <div className="lb-found__text">
        <p className="lb-found__line">
          {formatCopy(c.foundOne, { name: row.fullName, rank: row.rank, size: NUM.format(size) })}
        </p>
        <p className="lb-found__meta">
          {NUM.format(row.points)} {c.points} · {levelFor(row.points).nameAr}
        </p>
      </div>
      <span className="lb-found__rank">
        <span className="lb-found__hash">#</span>
        {row.rank}
      </span>
    </div>
  );
}

function Row({ row, index }: { row: LeaderboardStudent; index: number }) {
  const medal = row.rank <= 3 && row.points > 0 ? row.rank : undefined;
  const level = levelFor(row.points);
  const owedLeft = Math.max(0, row.homework.owed - row.homework.submitted);
  const place = [row.governorate, row.city].filter(Boolean).join(' · ');

  return (
    <li className="lb-row" data-place={medal} style={{ '--d': Math.min(index, 12) } as CSSProperties}>
      <span className="lb-rank" title={`${c.columnRank} ${row.rank}`}>
        {medal ? <Medal className="lb-rank__medal" aria-hidden="true" /> : null}
        <span className="lb-rank__n">{row.rank}</span>
      </span>

      <div className="lb-who">
        <UserAvatar name={row.fullName} image={row.avatar} size={44} />
        <div className="lb-who__text">
          <Link href={`/admin/students/${row.userId}`} className="lb-who__name">
            {row.fullName}
          </Link>
          <p className="lb-who__meta">
            {place ? <span>{place}</span> : null}
            {row.phone ? <span className="lb-ltr">{row.phone}</span> : null}
          </p>
          {row.stream || !row.systemKnown || row.pendingReview > 0 ? (
            <p className="lb-who__chips">
              {row.stream ? (
                <span className="lb-chip" data-tone={row.stream}>
                  {copy.admin.students.streamFilterLabels[row.stream]}
                </span>
              ) : null}
              {row.systemKnown ? null : (
                <span className="lb-chip" data-tone="warn" title={c.systemUnknownHint}>
                  {c.systemUnknown}
                </span>
              )}
              {row.pendingReview > 0 ? (
                <span className="lb-chip" data-tone="pending">
                  {formatCopy(c.pendingChip, { n: row.pendingReview })}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <div className="lb-points" data-level={level.key}>
        <LevelGem level={level.key} className="lb-points__gem" />
        <span className="lb-points__n">{NUM.format(row.points)}</span>
        <span className="lb-points__lvl">{level.nameAr}</span>
      </div>

      <Metric
        kind="quiz"
        icon={<Target className="size-4" />}
        label={c.columnQuizzes}
        value={row.quizzes.average}
        hint={formatCopy(c.quizzesHint, { count: row.quizzes.count, full: row.quizzes.fullMarks })}
      />
      <Metric
        kind="exam"
        icon={<CalendarCheck2 className="size-4" />}
        label={c.columnExams}
        value={row.exams.average}
        hint={formatCopy(c.examsHint, { count: row.exams.count })}
      />

      <div className="lb-metric" data-kind="homework">
        <span className="lb-metric__label">
          <ClipboardCheck className="size-4" aria-hidden="true" />
          {c.columnHomework}
        </span>
        <span className="lb-metric__value">
          <span className="lb-ltr">
            {row.homework.submitted}
            {row.homework.owed > 0 ? ` / ${row.homework.owed}` : ''}
          </span>
        </span>
        {row.homework.owed > 0 ? (
          <span className="lb-metric__bar" aria-hidden="true">
            <span
              style={
                { '--lb-fill': `${Math.min(100, (row.homework.submitted / row.homework.owed) * 100)}%` } as CSSProperties
              }
            />
          </span>
        ) : null}
        <span className="lb-metric__hint">
          {formatCopy(c.homeworkHint, { accepted: row.homework.accepted })}
          {owedLeft > 0 ? (
            <span className="lb-metric__owed"> · {formatCopy(c.homeworkOwed, { n: owedLeft })}</span>
          ) : null}
        </span>
      </div>

      <span className="lb-last">
        <Clock className="size-3.5" aria-hidden="true" />
        {lastActive(row.lastActiveAt)}
      </span>

      <div className="lb-actions">
        <Link href={`/admin/students/${row.userId}`} className="lb-btn">
          {c.openRecord}
          <ArrowLeft className="size-3.5" aria-hidden="true" />
        </Link>
        <WhatsappButton phone={row.phone} label={c.whatsapp} size="sm" />
      </div>
    </li>
  );
}

function Metric({
  kind,
  icon,
  label,
  value,
  hint,
}: {
  kind: 'quiz' | 'exam';
  icon: ReactNode;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="lb-metric" data-kind={kind}>
      <span className="lb-metric__label">
        <span aria-hidden="true">{icon}</span>
        {label}
      </span>
      <span className="lb-metric__value">
        {value === null ? c.noneYet : <span className="lb-ltr">{`${Math.round(value)}%`}</span>}
      </span>
      {value === null ? null : (
        <span className="lb-metric__bar" aria-hidden="true">
          <span style={{ '--lb-fill': `${Math.min(100, value)}%` } as CSSProperties} />
        </span>
      )}
      <span className="lb-metric__hint">{hint}</span>
    </div>
  );
}

/** «من ١٢ يوم»، والنهارده وامبارح بكلمتهم — نفس صياغة «متابعة الطلبة». */
function lastActive(iso: string | null): string {
  if (iso === null) return c.lastActiveNever;
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return c.lastActiveToday;
  if (days === 1) return c.lastActiveYesterday;
  return formatCopy(c.lastActiveDays, { days });
}

function freshness(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  return minutes < 1 ? c.computedNow : formatCopy(c.computedAt, { minutes });
}

/** قيمة متكررة في الرابط غلطة هنا، مش فلتر بقيم كتير. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
