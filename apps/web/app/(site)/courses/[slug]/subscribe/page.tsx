import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { getCourse } from '@/lib/catalog';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { buildMetadata } from '@/lib/seo/metadata';
import { SubscribePanel } from '@/components/site/subscribe-panel';

type Params = { slug: string };

/**
 * «عايز أشتري شهر تاني» — the checkout, as a page anybody can link to.
 *
 * ## Why this route has to exist
 *
 * Until it did, `<SubscribePanel>` had exactly ONE way in: `CourseStartButton`
 * opens it when `POST /enroll` answers 403. That works for the student who owns
 * nothing and it is unreachable for the student who owns SOMETHING — which
 * curriculum months made the ordinary case.
 *
 * A student holding «شهر ٢» is enrolled and their access is live, so the enroll
 * returns 200 and the button walks them into a lesson. There is no 403 to open
 * the panel with, and `proxy.ts` sends `/courses/:slug` to their library
 * anyway. So the padlock on a «شهر ١» lecture had nothing real to point at:
 * they could see the month was shut and had no way to buy it. «الشهر واحد
 * هيبقى مقفول وهيبقى ظاهر له إنه مقفول ولازم يشتريه.»
 *
 * `COURSE_DETAIL_PATTERN` in `proxy.ts` is anchored (`/^\\/courses\\/([^/]+)$/`),
 * so this path is not the one that redirects — deliberately checked, and the
 * reason this is a child route rather than a query parameter on the parent.
 *
 * ## Public, like the page above it
 *
 * No session check here: an anonymous visitor who lands on it gets the same
 * panel, and the panel's own first press is what asks them to sign in. Gating
 * the ROUTE would mean the padlock's link behaved differently depending on
 * something the student cannot see, and the API refuses every write behind it
 * regardless.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const path = `/courses/${encodeURIComponent(slug)}/subscribe`;
  const course = await getCourse(slug);
  if (!course) return buildMetadata({ title: copy.subscribe.title, path });
  return buildMetadata({ title: `${copy.subscribe.title} — ${course.title}`, path });
}

export default async function CourseSubscribePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [course, settings] = await Promise.all([getCourse(slug), getPublicSettingsOrDefaults()]);
  if (!course) notFound();

  return (
    // `course-hero` + `site-shell` + `course-hero__back`: the same three
    // classes the course page's own header uses, so this reads as a page of
    // that course rather than as a screen of its own.
    <main className="course-hero">
      <div className="site-shell">
        <nav aria-label={copy.course.breadcrumbCatalog}>
          <Link
            href={`/courses/${encodeURIComponent(course.slug)}`}
            className="course-hero__back"
          >
            <ArrowRight size={16} aria-hidden="true" />
            {course.title}
          </Link>
        </nav>
        <h1 className="course-hero__title">{copy.subscribe.title}</h1>

        {/*
          No `onCancel`: on this route the panel IS the page, and a cancel that
          hid it would leave a blank screen with a back link on it. The «رجوع»
          above is the way out.

          Every price here comes from an hours-old `'use cache'` entry, exactly
          as it does on the course page, and exactly as harmlessly: the panel
          re-reads the catalogue live on mount for this precise reason (see its
          own note on why the props were never enough), and `months` has no
          cached twin at all.
        */}
        <SubscribePanel
          courseId={course.id}
          slug={course.slug}
          monthlyPriceCents={course.monthlyPriceCents}
          yearlyPriceCents={course.yearlyPriceCents}
          terms={course.terms}
          instapay={settings.contact.instapay}
        />
      </div>
    </main>
  );
}
