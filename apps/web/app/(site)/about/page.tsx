import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { AboutInstructor } from '@/components/site/about-instructor';
import { JsonLd } from '@/components/seo/json-ld';
import { PERSON_ID, SITE_URL, breadcrumbJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

const c = copy.landing;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    // The bare NAME as the title, not "عن المنصة". This page exists to be the
    // answer to a search for the person, and a title that leads with anything
    // else competes with the homepage for a query it is better placed to win.
    title: c.aboutPageTitle,
    description: c.aboutPageDescription,
    path: '/about',
  });
}

/**
 * `/about` — the page a search for «أيمن أبو العلا» should land on.
 *
 * ## Why this exists when the homepage already describes him
 *
 * The founder's ask was explicit: someone typing his name WITHOUT the word
 * «منصة» should find him first. The homepage answers "what is this platform";
 * its `<h1>` and its title both lead with «منصة أيمن أبو العلا», and it already
 * ranks for that. A bare-name query is a different intent — it is about the
 * person — and Google ranks PAGES, not `Person` entities buried in a
 * homepage's structured data.
 *
 * So this is a page whose topic IS him: the name as the `<h1>`, the name as the
 * title, and the `Person` entity restated here rather than only on `/`.
 *
 * ## The content is his, not invented
 *
 * Every sentence comes from `copy.landing.about*` — the same strings the
 * landing section renders, which he wrote. Nothing biographical is added here,
 * because inventing facts about a real person to feed a search engine is how a
 * site earns a manual action, and it would be a lie either way.
 *
 * The section component is reused rather than copied for the same reason: one
 * set of facts, edited in one place, so the page and the homepage cannot start
 * saying different things about him.
 */
export default function AboutPage() {
  return (
    <main>
      {/*
        NOT a second `personJsonLd()`. The site layout already emits the full
        `Person` on every page, so repeating it here would put the same `@id`
        in one document twice — redundant at best.
        
        What is genuinely missing, and what this page exists to say, is that
        the page's SUBJECT is that person. `ProfilePage` with `mainEntity`
        pointing at the existing `@id` states exactly that and nothing else:
        the entity is defined once, and this declares which page is about it.
      */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          '@id': `${SITE_URL}/about#webpage`,
          url: `${SITE_URL}/about`,
          name: c.aboutPageTitle,
          description: c.aboutPageDescription,
          inLanguage: 'ar',
          mainEntity: { '@id': PERSON_ID },
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: c.aboutPageTitle, path: '/about' },
        ])}
      />

      <header className="page-head site-shell">
        {/* The `<h1>` is the name alone. Everything a crawler weighs most —
            title, h1, first paragraph — says the same thing the query does. */}
        <h1 className="page-title">{c.aboutPageTitle}</h1>
        <p className="site-lead">{c.aboutPageLead}</p>
      </header>

      {/* Reused wholesale. Its own `<h2>` is «مين أيمن أبو العلا؟», which sits
          correctly UNDER an `<h1>` of the name — a question about the subject,
          below the subject. */}
      <AboutInstructor />

      <section className="site-section">
        <div className="site-shell" style={{ textAlign: 'center' }}>
          <Link className="site-btn site-btn--solid" href="/courses">
            <ArrowLeft size={16} className="site-btn__arrow" aria-hidden="true" />
            {c.aboutPageCta}
          </Link>
        </div>
      </section>
    </main>
  );
}
