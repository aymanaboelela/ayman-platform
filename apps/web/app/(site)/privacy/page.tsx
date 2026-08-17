import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { LegalItem, LegalPage, LegalSection, legalOrigin } from '@/components/site/legal-page';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { buildMetadata } from '@/lib/seo/metadata';

const c = copy.legal;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: c.privacyTitle, description: c.privacyLead, path: '/privacy' });
}

/**
 * `/privacy` — what the onboarding form is allowed to point at.
 *
 * The contact address is read from site settings rather than written here, for
 * one reason: a policy that names an address nobody reads is worse than no
 * policy. The admin already maintains `contact.email` under
 * `/admin/settings`, so this renders whatever is actually monitored, and falls
 * back to the footer's social accounts when nothing is configured — which is
 * true, and better than printing a dead address.
 */
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  /*
   * `?from=onboarding`, set by the link under the account form.
   *
   * Read here and narrowed through `legalOrigin` — an enum, never a URL. A
   * public page that redirects wherever a query string tells it to is an open
   * redirect, and this is the page linked from the one form on the platform
   * that asks for a phone number, so it is the last place to put one.
   *
   * Reading `searchParams` makes this render dynamic under
   * `cacheComponents: true`. That is contained rather than costly: the route
   * has its own `loading.tsx`, so Next already has a Suspense boundary here,
   * and the policy's only other read (`getPublicSettingsOrDefaults`) is
   * `'use cache'` and stays shared across every visitor.
   */
  const [{ contact }, { from }] = await Promise.all([
    getPublicSettingsOrDefaults(),
    searchParams,
  ]);

  return (
    <LegalPage
      title={c.privacyTitle}
      lead={c.privacyLead}
      crossLinkHref="/terms"
      crossLinkLabel={c.seeAlsoTerms}
      origin={legalOrigin(from)}
    >
      <LegalSection title={c.ownerTitle} body={c.ownerBody}>
        <p>
          <strong>{c.ownerContactLabel}</strong>{' '}
          {contact.email ? (
            // dir="ltr" so an address never renders with its parts reordered
            // inside an RTL paragraph.
            <a href={`mailto:${contact.email}`} dir="ltr">
              {contact.email}
            </a>
          ) : (
            c.ownerContactFallback
          )}
        </p>
      </LegalSection>

      <LegalSection title={c.collectTitle}>
        <LegalItem term={c.collectAccount} body={c.collectAccountBody} />
        <LegalItem term={c.collectProfile} body={c.collectProfileBody} />
        {/* Called out as its own item, not folded into the profile list. These
            are the two fields that made this page necessary, and burying them
            in a sentence about school names is exactly the move the page is
            supposed to be the opposite of. */}
        <LegalItem term={c.collectParents} body={c.collectParentsBody} />
        <LegalItem term={c.collectProgress} body={c.collectProgressBody} />
        <LegalItem term={c.collectTechnical} body={c.collectTechnicalBody} />
      </LegalSection>

      <LegalSection title={c.neverTitle} body={c.neverBody} />

      <LegalSection title={c.shareTitle} body={c.shareBody}>
        <ul className="legal__list">
          <li>{c.shareCloudflare}</li>
          <li>{c.shareYoutube}</li>
          <li>{c.shareClarity}</li>
          <li>{c.shareHosting}</li>
        </ul>
      </LegalSection>

      <LegalSection title={c.cookiesTitle} body={c.cookiesBody} />
      <LegalSection title={c.rightsTitle} body={c.rightsBody} />
      <LegalSection title={c.minorsTitle} body={c.minorsBody} />
      <LegalSection title={c.changesTitle} body={c.changesBody} />
    </LegalPage>
  );
}
