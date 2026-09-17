import type { Metadata } from 'next';
import { tenantSentence } from '@/lib/tenant-copy';
import { copy } from '@ayman/contracts';
import { JsonLd } from '@/components/seo/json-ld';
import { BooksShippingChip, BooksShop } from '@/components/site/books-shop';
import { getBookCatalogOrEmpty } from '@/lib/books';
import { bookListJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld';
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
    /*
     * ⚠️ «كتب أيمن أبو العلا — اطلبها وتوصلك البيت» has the name welded into
     * it, and this is the `<title>`, the `og:title` and the `twitter:title` of
     * the page a parent opens to buy a book. On a tenant stack it read his name
     * beside their own platform name in the same string.
     */
    title: tenantSentence(c.metaTitle),
    description: tenantSentence(c.metaDescription),
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
 * ## And every book, advertised or not
 *
 * `showOnLanding` is read by `<BooksStrip>` and by nothing here. Placement is
 * not visibility: taking a title off the landing page is the instructor saying
 * «مش عايزه في الواجهة», not «مش للبيع» — the switch for that is `isActive`,
 * which the API applies before this payload is built. A shop that hid its own
 * unadvertised stock would break every `/books#book-{slug}` link ever shared
 * for one, which is the one place those links are guaranteed to point.
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
      {/*
        ⚠️ This is the ONLY server-rendered description of the shop.
        `<BooksShop>` is a client component and its shelves arrive on the RSC
        stream — `books-shop.tsx`'s own scroll note records the measurement:
        `curl /books` returns zero rendered cards. So a crawler that does not
        run JavaScript saw a hero, a heading and nothing for sale, on the one
        page that states a price a stranger can act on. The markdown twin
        (`/books.md`) is the other half of the same fix.
      */}
      <JsonLd data={bookListJsonLd(catalog.shelves, catalog.shippingCents)} />

      <section className="books-hero">
        <div className="site-shell">
          <span className="site-badge">{c.badge}</span>
          <h1 className="page-title" style={{ marginTop: '1rem' }}>
            {c.pageTitle}
          </h1>
          <p className="site-lead books-hero__lead">{c.lead}</p>
          {/*
            That delivery is charged, and charged once — without naming the
            amount. The figure is a setting that moves, and a number printed
            across the top of the shop is where a stale one reads as a promise;
            the basket quotes the live value. The fee is still passed in: at
            zero the line becomes a different sentence entirely, and only the
            number can decide that. See `copy.books.shippingOnce`.
          */}
          <BooksShippingChip rates={catalog.shippingRates} />
        </div>
      </section>

      <BooksShop catalog={catalog} instapay={contact.instapay} vodafoneCash={contact.vodafoneCash} />
    </main>
  );
}
