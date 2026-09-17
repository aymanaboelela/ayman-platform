import type { Metadata } from 'next';
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, faqPageJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { subscribeSteps, subscribeFaqRows, subscribeRails } from '@/lib/subscribe-steps';

const c = copy.subscribePage;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: c.metaTitle, description: c.metaDescription, path: '/subscribe' });
}

/**
 * «إزاي أشترك؟» — the question with a definite published answer and, until
 * now, no public page.
 *
 * ## Why a page and not another FAQ row
 *
 * Verified on production 2026-09-15: `/checkout`, `/pricing`, `/payment`,
 * `/faq` and `/help` all 404. Every course page publishes its four prices and
 * then says the lessons need «حساب طالب واشتراك» — and stops. The checkout
 * that carries InstaPay and Vodafone Cash is behind auth, so none of it
 * appears on a single anonymous byte, and an assistant asked «إزاي أدفع؟» had
 * to decline a question this platform answers every day.
 *
 * ## What is deliberately absent — see `copy.subscribePage`
 *
 * No turnaround window, no refund policy, and no destination number. Each has
 * its reason recorded on the copy block; none of them is an oversight, and the
 * third one is the difference between a help page and a scam-clone template.
 *
 * ## Why the rails are read live
 *
 * `PaymentMethodChoice` renders a rail only when the admin has configured it,
 * and this page has to agree — a shipped constant would keep promising
 * فودافون كاش after the number was cleared. `getPublicSettingsOrDefaults`,
 * never the throwing variant: this page is prerendered and the API is
 * unreachable inside `docker build`, where an unconfigured-looking page is
 * recoverable and a failed build is not.
 */
export default async function SubscribePage() {
  const { contact } = await getPublicSettingsOrDefaults();
  const rails = subscribeRails(contact);

  return (
    <main>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.course.breadcrumbHome, path: '/' },
          { name: c.title, path: '/subscribe' },
        ])}
      />
      {/* ⚠️ The rows the page RENDERS, not a second set written for the markup
          — `faqPageJsonLd`'s own rule. `subscribeFaqRows` builds its answers
          from the same step strings printed below, so the two cannot drift. */}
      <JsonLd data={faqPageJsonLd(subscribeFaqRows(rails))} />

      <section className="site-section">
        <div className="site-shell">
          <p className="site-eyebrow">{c.eyebrow}</p>
          <h1 className="page-title">{c.title}</h1>
          <p className="site-lead">{c.lead}</p>

          <ol className="subscribe-steps">
            {subscribeSteps().map((step, index) => (
              <li key={step.title} className="subscribe-step">
                <span className="subscribe-step__n" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h2 className="subscribe-step__title">{step.title}</h2>
                  <p className="subscribe-step__body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <h2 className="site-h2">{c.railsTitle}</h2>
          {rails.length > 0 ? (
            <ul className="subscribe-rails">
              {rails.map((rail) => (
                <li key={rail}>{rail}</li>
              ))}
            </ul>
          ) : (
            // Not an error state: the rails are admin-configured, and a page
            // that says so is honest where a page listing two unavailable
            // options is not.
            <p className="site-lead">{c.railsNone}</p>
          )}

          <p className="site-lead">{c.booksNote}</p>

          <div className="subscribe-ctas">
            <Link href="/courses" className="site-btn site-btn--primary">
              {c.coursesCta}
            </Link>
            <Link href="/books" className="site-btn">
              {c.booksCta}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
