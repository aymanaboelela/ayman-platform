import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { LegalPage, LegalSection } from '@/components/site/legal-page';
import { buildMetadata } from '@/lib/seo/metadata';

const c = copy.legal;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: c.termsTitle, description: c.termsLead, path: '/terms' });
}

/**
 * `/terms` — the other half of what a visitor (and a classifier) looks for
 * before trusting a form with a phone number.
 *
 * Deliberately short. A wall of boilerplate nobody reads does not make the
 * site more trustworthy; six specific claims that match how the platform
 * actually behaves do. Every one of them is verifiable in the codebase: the
 * device list exists (`SessionDevice`), the one-sitting rule and the exam's
 * single improvement sitting are `attemptAllowance()` and `QuizPaper`, and the
 * platform genuinely has no payments (`Course.priceCents` is always 0 in v1).
 *
 * The quiz clause used to promise an appeals process. That promise is now
 * false, and a terms page that over-promises is worse than one that says less
 * — so it states the rule that actually runs instead.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title={c.termsTitle}
      lead={c.termsLead}
      crossLinkHref="/privacy"
      crossLinkLabel={c.seeAlsoPrivacy}
    >
      <LegalSection title={c.ownerTitle} body={c.ownerBody} />
      <LegalSection title={c.termsUseTitle} body={c.termsUseBody} />
      <LegalSection title={c.termsContentTitle} body={c.termsContentBody} />
      <LegalSection title={c.termsQuizTitle} body={c.termsQuizBody} />
      <LegalSection title={c.termsAvailabilityTitle} body={c.termsAvailabilityBody} />
      <LegalSection title={c.termsTerminationTitle} body={c.termsTerminationBody} />
    </LegalPage>
  );
}
