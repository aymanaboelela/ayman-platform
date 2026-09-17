import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { AboutInstructor } from '@/components/site/about-instructor';
import { SiteFaq } from '@/components/site/site-faq';
import { JsonLd } from '@/components/seo/json-ld';
import { PERSON_ID, SITE_URL, breadcrumbJsonLd, faqPageJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

const c = copy.landing;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    /*
     * The NAME, then the ROLE — not "عن المنصة" and no longer the bare name
     * either.
     *
     * The bare name was right about one thing and wrong about another. Right:
     * a title leading with «منصة» competes with the homepage for a query the
     * homepage wins. Wrong: «أيمن أبو العلا» alone answers ONLY a query that
     * already contains the name, and the queries worth winning do not —
     * «أفضل مدرس برمجة بكالوريا» has no name in it at all.
     *
     * ⚠️ The name still LEADS. Measured 2026-09-13: this name is contested —
     * an MP shares it and dominates the results — so the role is what tells a
     * searcher and a crawler which أيمن أبو العلا this page is about, and it is
     * the half that matches an unbranded query.
     */
    title: c.aboutPageRoleTitle,
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

      {/*
        The FAQ, and the reason it is on this page.
        
        Measured on 2026-09-13, the site that DOES rank for «أفضل مدرس برمجة
        وذكاء اصطناعي بكالوريا» is a one-page brochure whose strongest asset is
        exactly this: a `FAQPage` whose first question is «ليه أتعلّم … معايا
        تحديدًا؟». That is the question an assistant is resolving, answered as a
        labelled question/answer pair instead of left to be inferred from
        marketing copy.
        
        The same facts already went to `/llms.txt` and `/AGENTS.md`
        (`copy.seo.instructorWhy`), which is where an assistant reads them. This
        is where Google and Bing do. Both surfaces, one set of facts.
        
        ⚠️ `SiteFaq` renders these rows and `faqPageJsonLd` describes THE SAME
        array. Structured data describing questions a page does not show is the
        one failure here worse than no structured data — so if the visible list
        is ever filtered or truncated, the markup has to take the same list, not
        `aboutFaq` again.
      */}
      <JsonLd data={faqPageJsonLd(c.aboutFaq)} />
      <SiteFaq title={c.aboutFaqTitle} eyebrow={c.aboutFaqEyebrow} rows={[...c.aboutFaq]} />

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
