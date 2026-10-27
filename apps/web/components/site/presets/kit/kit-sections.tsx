import Image from 'next/image';
import { ThemedImage } from '@/components/themed-image';
import { keyPair } from '@/lib/brand-image';
import Link from 'next/link';
import {
  BookOpenText,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  Layers,
  Medal,
  MessageCircleQuestion,
  MonitorSmartphone,
  NotebookPen,
  PenLine,
  Route,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import type { BookCard } from '@ayman/contracts/books';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import { mediaUrl } from '@ayman/ui/branding';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getBookCatalogOrEmpty } from '@/lib/books';
import { getBranding } from '@/lib/settings';
import { tenantName } from '@/lib/tenant';
import { formatEGP } from '@/lib/price';
import { courseCountLabel } from '@/lib/course-groups';
import { yearPages } from '@/lib/grade-pages';
import { CourseArt } from '@/components/course-art';
import { StreamBadge } from '@/components/stream-badge';
import { initials } from '@/components/app/user-avatar';
import { HeroOrnament, KurrasaCheck, RuqaaArch, RuqaaDivider } from './kit-ornaments';
import { kitCopy } from './kit-copy';
import type { KitPreset } from './kit-preset';

/*
 * One set of sections for three presets. The markup is shared and semantic;
 * what makes «الرقعة», «الكرّاسة» and «الطيف» three pages is the stylesheet
 * (`styles/presets-kit.css`, scoped per `[data-preset]`) plus the few drawn
 * things a preset carries that the others do not — passed in by `preset`,
 * never guessed from the DOM.
 */

type Level = 1 | 2;

export function KitHeading({
  preset,
  chip,
  title,
  lead,
  level,
}: {
  preset: KitPreset;
  chip?: string;
  title: string;
  lead?: string;
  level: Level;
}) {
  const Title = level === 1 ? 'h1' : 'h2';
  return (
    <header className="pk-head">
      {chip ? <span className="pk-chip">{chip}</span> : null}
      <Title className="pk-head__title">{title}</Title>
      {preset === 'ruqaa' ? <RuqaaDivider /> : null}
      {lead ? <p className="pk-head__lead">{lead}</p> : null}
    </header>
  );
}

/* ── the opener ──────────────────────────────────────────────────────── */

export function KitHero({
  preset,
  branding,
  name,
  eyebrow,
  headline,
  role,
  lead,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  stats,
  level,
}: {
  preset: KitPreset;
  branding: BrandingRead;
  name: string;
  eyebrow: string;
  headline: string;
  role: string;
  lead: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  stats: readonly { value: string; labelAr: string }[];
  level: Level;
}) {
  const Title = level === 1 ? 'h1' : 'h2';
  // The hero photo first, the portrait if that is all there is. Neither is
  // load-bearing: with no photo the art becomes the name's first letter, set
  // in the preset's display face — a monogram, not an empty frame.
  const photo = branding.heroKey ?? branding.portraitKey;
  // The dark file of WHICHEVER picture `photo` picked, never a mix of the two.
  const photoDark = branding.heroKey ? branding.heroDarkKey : branding.portraitDarkKey;

  return (
    <section className="pk-hero" data-site-hero>
      <HeroOrnament preset={preset} />
      <div className="pk-shell pk-hero__grid">
        <div className="pk-hero__copy">
          {eyebrow ? <span className="pk-chip pk-chip--hero">{eyebrow}</span> : null}
          <Title className="pk-hero__title">
            {/* The span is what «الكرّاسة»'s highlighter sweeps across; on the
                other two it is an inert inline box. */}
            <span className="pk-hero__ink">{headline}</span>
          </Title>
          {role ? <p className="pk-hero__role">{role}</p> : null}
          {lead ? <p className="pk-hero__lead">{lead}</p> : null}

          {ctaLabel || secondaryCtaLabel ? (
            <div className="pk-hero__cta">
              {ctaLabel ? (
                <Link className="pk-btn pk-btn--primary" href={ctaHref}>
                  {ctaLabel}
                </Link>
              ) : null}
              {secondaryCtaLabel ? (
                <Link className="pk-btn pk-btn--ghost" href={secondaryCtaHref}>
                  {secondaryCtaLabel}
                </Link>
              ) : null}
            </div>
          ) : null}

          {stats.length > 0 ? (
            <dl className="pk-figs">
              {stats.map((stat, index) => (
                <div className="pk-fig" key={`${stat.labelAr}-${index}`}>
                  <dt className="pk-fig__n tabular-nums">{stat.value}</dt>
                  <dd className="pk-fig__l">{stat.labelAr}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="pk-hero__art" aria-hidden="true">
          {preset === 'ruqaa' ? <RuqaaArch /> : null}
          <div className="pk-hero__frame">
            {photo ? (
              <ThemedImage
                className="pk-hero__photo"
                image={keyPair(photo, photoDark, 900, 1104)}
                alt=""
                sizes="(min-width: 60rem) 26rem, 70vw"
                priority
              />
            ) : (
              <span className="pk-hero__mono">{name.trim().charAt(0)}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── the grades ──────────────────────────────────────────────────────── */

export async function KitGrades({ preset, level }: { preset: KitPreset; level: Level }) {
  const { courses } = await getCatalogOrEmpty();
  // `yearPages()`: the stack's grades with `TENANT_GRADES`, the three
  // secondary years without — the same pages the footer and sitemap list.
  const pages = yearPages();

  return (
    <section className="pk-band pk-band--grades" id="years">
      <div className="pk-shell">
        <KitHeading
          preset={preset}
          chip={kitCopy.grades.chip}
          title={kitCopy.grades.title}
          lead={kitCopy.grades.lead}
          level={level}
        />
        <ul className="pk-grades" role="list">
          {pages.map((page) => {
            const count = courses.filter(page.matches).length;
            return (
              <li className="pk-grade" key={page.segment}>
                <Link className="pk-grade__link" href={`/years/${page.segment}`}>
                  {page.stageAr ? <span className="pk-grade__stage">{page.stageAr}</span> : null}
                  <span className="pk-grade__n tabular-nums" aria-hidden="true">
                    {page.n}
                  </span>
                  <span className="pk-grade__name">{page.title}</span>
                  {count > 0 ? <span className="pk-grade__count">{courseCountLabel(count)}</span> : null}
                  <span className="pk-grade__go">{kitCopy.grades.tileCta}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ── why here ────────────────────────────────────────────────────────── */

/** One glyph per position, so eight items never repeat a mark. */
const WHY_ICONS: readonly LucideIcon[] = [
  Route,
  PenLine,
  ClipboardCheck,
  CalendarCheck,
  NotebookPen,
  Users,
  MessageCircleQuestion,
  MonitorSmartphone,
  BookOpenText,
  GraduationCap,
  Layers,
  Medal,
];

export function KitWhy({
  preset,
  title,
  titleAccent,
  lead,
  items,
  level,
}: {
  preset: KitPreset;
  title: string;
  titleAccent: string;
  lead: string;
  items: readonly { titleAr: string; bodyAr: string }[];
  level: Level;
}) {
  // The accent is part of the sentence («ليه العربي هنا» + «مختلف»), so it is
  // joined into the heading rather than set apart in another colour.
  const heading = titleAccent ? `${title} ${titleAccent}` : title;
  return (
    <section className="pk-band pk-band--why" id="why">
      <div className="pk-shell">
        <KitHeading preset={preset} chip={kitCopy.features.chip} title={heading} lead={lead} level={level} />
        <ul className="pk-why" role="list">
          {items.map((item, index) => {
            const Icon = WHY_ICONS[index % WHY_ICONS.length]!;
            return (
              <li className="pk-why__item" key={`${item.titleAr}-${index}`}>
                <span className="pk-why__mark" aria-hidden="true">
                  {preset === 'kurrasa' ? <KurrasaCheck /> : <Icon size={22} strokeWidth={1.8} />}
                </span>
                <h3 className="pk-why__title">{item.titleAr}</h3>
                <p className="pk-why__body">{item.bodyAr}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ── courses ─────────────────────────────────────────────────────────── */

function priceLine(course: CatalogCourse): { from: boolean; text: string } {
  if (course.monthlyPriceCents !== null) {
    return { from: true, text: formatCopy(copy.course.priceMonthly, { price: formatEGP(course.monthlyPriceCents) }) };
  }
  if (course.quarterlyPriceCents !== null) {
    return { from: true, text: formatCopy(copy.course.priceQuarterly, { price: formatEGP(course.quarterlyPriceCents) }) };
  }
  if (course.yearlyPriceCents !== null) {
    return { from: true, text: formatCopy(copy.course.priceYearly, { price: formatEGP(course.yearlyPriceCents) }) };
  }
  return { from: false, text: copy.landing.courseFree };
}

export async function KitCourses({
  preset,
  title,
  lead,
  ctaLabel,
  limit,
  courseIds,
  level,
}: {
  preset: KitPreset;
  title: string;
  lead: string;
  ctaLabel: string;
  limit: number;
  courseIds: readonly string[];
  level: Level;
}) {
  const { courses } = await getCatalogOrEmpty();
  const featured =
    courseIds.length > 0
      ? courseIds
          .map((id) => courses.find((course) => course.id === id))
          .filter((course) => course !== undefined)
          .slice(0, limit)
      : courses.slice(0, limit);

  return (
    <section className="pk-band pk-band--courses" id="courses">
      <div className="pk-shell">
        <KitHeading preset={preset} chip={kitCopy.courses.chip} title={title} lead={lead} level={level} />

        {featured.length === 0 ? (
          <div className="pk-empty">
            <p className="pk-empty__title">{kitCopy.courses.emptyTitle}</p>
            <p className="pk-empty__body">{kitCopy.courses.emptyBody}</p>
            <Link className="pk-btn pk-btn--primary" href="/register">
              {kitCopy.courses.emptyCta}
            </Link>
          </div>
        ) : (
          <>
            <ul className="pk-courses" role="list">
              {featured.map((course) => {
                const price = priceLine(course);
                return (
                  <li className="pk-course" key={course.id}>
                    {/* A cover keeps its own ratio — see `board-courses.tsx`
                        on why a forced 16/9 crops a designed poster. */}
                    <div className={course.coverKey ? 'pk-course__art pk-course__art--bleed' : 'pk-course__art'}>
                      <CourseArt
                        coverKey={course.coverKey}
                        subjectNameAr={course.subjectNameAr}
                        seed={course.slug}
                        sizes="(min-width: 64rem) 21rem, (min-width: 44rem) 45vw, 92vw"
                      />
                    </div>
                    <div className="pk-course__body">
                      <h3 className="pk-course__title">
                        {/* The only anchor; `::after` stretches it over the card. */}
                        <Link className="pk-course__link" href={`/courses/${course.slug}`}>
                          {course.title}
                        </Link>
                      </h3>
                      <StreamBadge forGeneral={course.forGeneral} forLanguages={course.forLanguages} />
                      <p className="pk-course__meta">
                        <span>
                          <GraduationCap size={15} aria-hidden="true" />
                          {course.systemNameAr}
                          {course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''}
                        </span>
                        <span>
                          <Layers size={15} aria-hidden="true" />
                          {course.lessonCount} {copy.catalog.lessonCount}
                        </span>
                      </p>
                      <p className="pk-course__price">
                        {price.from ? <span className="pk-course__from">{kitCopy.courses.priceFrom}</span> : null}
                        <span className="pk-course__price-n tabular-nums">{price.text}</span>
                      </p>
                      <span className="pk-course__cta" aria-hidden="true">
                        {copy.landing.courseOpen}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {ctaLabel ? (
              <div className="pk-band__foot">
                <Link className="pk-btn pk-btn--primary" href="/courses">
                  {ctaLabel}
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/* ── books ───────────────────────────────────────────────────────────── */

export async function KitBooks({
  preset,
  title,
  lead,
  ctaLabel,
  limit,
  level,
}: {
  preset: KitPreset;
  title: string;
  lead: string;
  ctaLabel: string;
  limit: number;
  level: Level;
}) {
  const catalog = await getBookCatalogOrEmpty();
  const books: BookCard[] = catalog.shelves
    .flatMap((shelf) => [...shelf.first, ...shelf.second, ...shelf.full])
    .filter((book) => book.showOnLanding)
    .slice(0, limit);
  // A strip of nothing is worse than no strip — the same call `<BoardBooks>` makes.
  if (books.length === 0) return null;

  return (
    <section className="pk-band pk-band--books" id="books">
      <div className="pk-shell">
        <KitHeading preset={preset} chip={kitCopy.books.chip} title={title} lead={lead} level={level} />
        <ul className="pk-books" role="list">
          {books.map((book) => (
            <li className="pk-book" key={book.id}>
              <Link className="pk-book__link" href={`/books#book-${book.slug}`}>
                <span className="pk-book__art">
                  <CourseArt
                    coverKey={book.coverKey}
                    subjectNameAr={book.titleAr}
                    seed={book.slug}
                    compact
                    sizes="(min-width: 44rem) 14rem, 45vw"
                  />
                </span>
                <span className="pk-book__title">{book.titleAr}</span>
                <span className="pk-book__price tabular-nums">{formatEGP(book.priceCents)}</span>
                <span className="pk-book__cta">{kitCopy.books.buy}</span>
              </Link>
            </li>
          ))}
        </ul>
        {ctaLabel ? (
          <div className="pk-band__foot">
            <Link className="pk-btn pk-btn--primary" href="/books">
              {ctaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ── the teacher ─────────────────────────────────────────────────────── */

export async function KitInstructor({ preset, level }: { preset: KitPreset; level: Level }) {
  const [{ courses }, branding] = await Promise.all([getCatalogOrEmpty(), getBranding()]);
  const lessons = courses.reduce((sum, course) => sum + course.lessonCount, 0);
  const hours = Math.round(courses.reduce((sum, course) => sum + course.totalSeconds, 0) / 3600);

  return (
    <section className="pk-band pk-band--instructor" id="instructor">
      <div className="pk-shell">
        <KitHeading preset={preset} chip={kitCopy.instructor.chip} title={kitCopy.instructor.title} level={level} />
        <div className="pk-id">
          {branding.portraitKey ? (
            <span className="pk-id__portrait">
              <ThemedImage image={keyPair(branding.portraitKey, branding.portraitDarkKey, 192, 256)} alt="" sizes="192px" />
            </span>
          ) : null}
          {/* `tenantName()`, never `copy.site.instructor` directly — CLAUDE.md §2. */}
          <p className="pk-id__name">{tenantName(copy.site.instructor)}</p>
          {courses.length > 0 ? (
            <dl className="pk-figs pk-figs--id">
              <div className="pk-fig">
                <dt className="pk-fig__n tabular-nums">{courses.length}</dt>
                <dd className="pk-fig__l">{kitCopy.instructor.coursesUnit}</dd>
              </div>
              <div className="pk-fig">
                <dt className="pk-fig__n tabular-nums">{lessons}</dt>
                <dd className="pk-fig__l">{kitCopy.instructor.lessonsUnit}</dd>
              </div>
              <div className="pk-fig">
                <dt className="pk-fig__n tabular-nums">{hours}</dt>
                <dd className="pk-fig__l">{kitCopy.instructor.hoursUnit}</dd>
              </div>
            </dl>
          ) : (
            <p className="pk-id__starting">{kitCopy.instructor.starting}</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── honour board ────────────────────────────────────────────────────── */

const HONOR = copy.landing.honorBoard;

export function KitHonors({
  preset,
  entries,
  level,
}: {
  preset: KitPreset;
  entries: readonly HonorBoardEntry[];
  level: Level;
}) {
  return (
    <section className="pk-band pk-band--honors" id="honor-board">
      <div className="pk-shell">
        <KitHeading preset={preset} chip={kitCopy.honors.chip} title={HONOR.title} lead={HONOR.lead} level={level} />
        {entries.length === 0 ? (
          <div className="pk-empty">
            <p className="pk-empty__body">{HONOR.waiting}</p>
          </div>
        ) : (
          <ul className="pk-honors" role="list">
            {entries.map((entry) => (
              <li className="pk-honor" key={`${entry.studentName}-${entry.courseLabel}-${entry.rank}`}>
                <span className="pk-honor__medal" aria-hidden="true">
                  <Medal size={20} strokeWidth={2} />
                </span>
                {/* `entry.rank`, never the list index: one race per course, so
                    two cards can both be «المركز الأول». Initials only — the
                    board names a minor, see `board-honors.tsx`. */}
                <span className="pk-honor__rank">{HONOR.placeRanks[entry.rank - 1] ?? ''}</span>
                <span className="pk-honor__avatar" aria-hidden="true">
                  {initials(entry.studentName)}
                </span>
                <span className="pk-honor__name">{entry.studentName}</span>
                <span className="pk-honor__course">{entry.courseLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ── about, stats, quotes ────────────────────────────────────────────── */

export function KitAbout({
  preset,
  title,
  body1,
  body2,
  role,
  chips,
  imageKey,
  level,
}: {
  preset: KitPreset;
  title: string;
  body1: string;
  body2: string;
  role: string;
  chips: readonly string[];
  imageKey: string | null;
  level: Level;
}) {
  return (
    <section className="pk-band pk-band--about" id="about">
      <div className="pk-shell pk-about">
        <div className="pk-about__copy">
          <KitHeading preset={preset} chip={kitCopy.about.chip} title={title} level={level} />
          {role ? <p className="pk-about__role">{role}</p> : null}
          {body1 ? <p className="pk-about__body">{body1}</p> : null}
          {body2 ? <p className="pk-about__body">{body2}</p> : null}
          {chips.length > 0 ? (
            <ul className="pk-about__chips" role="list">
              {chips.map((chip) => (
                <li className="pk-chip" key={chip}>
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {imageKey ? (
          <span className="pk-about__img" aria-hidden="true">
            <Image src={mediaUrl(imageKey)} alt="" width={720} height={900} sizes="(min-width: 60rem) 24rem, 80vw" />
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function KitStats({
  preset,
  title,
  items,
  level,
}: {
  preset: KitPreset;
  title: string;
  items: readonly { labelAr: string; value: string }[];
  level: Level;
}) {
  return (
    <section className="pk-band pk-band--stats">
      <div className="pk-shell">
        {title ? <KitHeading preset={preset} chip={kitCopy.stats.chip} title={title} level={level} /> : null}
        <dl className="pk-figs pk-figs--band">
          {items.map((item, index) => (
            <div className="pk-fig" key={`${item.labelAr}-${index}`}>
              <dt className="pk-fig__n tabular-nums">{item.value}</dt>
              <dd className="pk-fig__l">{item.labelAr}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function KitQuotes({
  preset,
  title,
  items,
  level,
}: {
  preset: KitPreset;
  title: string;
  items: readonly { nameAr: string; bodyAr: string }[];
  level: Level;
}) {
  return (
    <section className="pk-band pk-band--quotes">
      <div className="pk-shell">
        {title ? <KitHeading preset={preset} chip={kitCopy.quotes.chip} title={title} level={level} /> : null}
        <ul className="pk-quotes" role="list">
          {items.map((item, index) => (
            <li className="pk-quote" key={`${item.nameAr}-${index}`}>
              <blockquote className="pk-quote__body">{item.bodyAr}</blockquote>
              <p className="pk-quote__name">{item.nameAr}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── faq, cta ────────────────────────────────────────────────────────── */

export function KitFaq({
  preset,
  title,
  eyebrow,
  rows,
  level,
}: {
  preset: KitPreset;
  title: string;
  eyebrow: string;
  rows: readonly { questionAr: string; answerAr: string }[];
  level: Level;
}) {
  return (
    <section className="pk-band pk-band--faq" id="faq">
      <div className="pk-shell pk-shell--narrow">
        {title ? <KitHeading preset={preset} chip={eyebrow || kitCopy.faq.chip} title={title} level={level} /> : null}
        <div className="pk-faq">
          {rows.map((row, index) => (
            // `name` makes the group exclusive natively: opening one closes
            // the one before, with no script watching.
            <details className="pk-faq__item" key={`${row.questionAr}-${index}`} open={index === 0} name="pk-faq">
              <summary className="pk-faq__q">
                <span>{row.questionAr}</span>
                <span className="pk-faq__mark" aria-hidden="true" />
              </summary>
              <p className="pk-faq__a">{row.answerAr}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function KitCta({
  headline,
  lead,
  ctaLabel,
  ctaHref,
}: {
  headline: string;
  lead: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <section className="pk-cta">
      <div className="pk-shell pk-cta__inner">
        <p className="pk-cta__title">{headline}</p>
        {lead ? <p className="pk-cta__lead">{lead}</p> : null}
        <Link className="pk-btn pk-btn--primary" href={ctaHref}>
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
