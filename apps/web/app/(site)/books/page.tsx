import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { JsonLd } from '@/components/seo/json-ld';
import { BooksShippingChip, BooksShop } from '@/components/site/books-shop';
import { getBookCatalogOrEmpty } from '@/lib/books';
import { breadcrumbJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { getPublicSettingsOrDefaults } from '@/lib/settings';

const c = copy.books;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    /*
     * «كتب أيمن أبو العلا — اطلبها وتوصلك البيت», not the bare word «الكتب».
     *
     * The query this page has to win is «كتاب أيمن أبو العلا» / «كتاب برمجة
     * تانية ثانوي», and both the name and the fact that it SHIPS belong in the
     * SERP entry — «هي بتتباع أونلاين؟» is the question a parent asks before
     * they click, and answering it in the title is worth more than the two
     * words it costs.
     */
    title: c.metaTitle,
    description: c.metaDescription,
    path: '/books',
  });
}

/**
 * «قسم الكتب» — the printed-book shop.
 *
 * ## Why this is one page and not a catalogue plus per-book pages
 *
 * A book here is a title, a price and a cover. There is no chapter list, no
 * preview, no reviews — nothing a dedicated page would hold that a card does
 * not, and a `/books/[slug]` route would be a page whose entire content is
 * already visible on the one that links to it. The shelves ARE the product,
 * and a reader comparing a first-term book against a second-term one wants
 * both on the same screen.
 *
 * ## Every visitor sees every year
 *
 * Deliberately, and the same way the course catalogue works: a first-year
 * student buying next year's book early is a sale, not a mistake to prevent.
 * The year chip on each card is what tells them apart.
 *
 * ## Failure containment
 *
 * `getBookCatalogOrEmpty` and `getPublicSettingsOrDefaults`, never their
 * throwing twins: this page is prerendered, and `next build` runs inside
 * `docker build` where no API is listening. An empty shop renders the «لسه
 * مفيش كتب» state, which is honest and recovers on the next revalidation; a
 * throw fails the build.
 */
export default async function BooksPage() {
  const [catalog, { contact }] = await Promise.all([
    getBookCatalogOrEmpty(),
    getPublicSettingsOrDefaults(),
  ]);

  return (
    <main className="books-page">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: c.pageTitle, path: '/books' },
        ])}
      />

      <section className="books-hero">
        <div className="site-shell">
          <span className="site-badge">{c.badge}</span>
          <h1 className="page-title" style={{ marginTop: '1rem' }}>
            {c.pageTitle}
          </h1>
          <p className="site-lead books-hero__lead">{c.lead}</p>
          {/*
            The delivery fee, on the shelf and not only at checkout. At these
            prices «٦٥ جنيه شحن» is not fine print, and meeting it for the first
            time on the last screen is how a basket gets abandoned.
          */}
          <BooksShippingChip shippingCents={catalog.shippingCents} />
        </div>
      </section>

      <BooksShop catalog={catalog} vodafoneCash={contact.vodafoneCash} />
    </main>
  );
}
