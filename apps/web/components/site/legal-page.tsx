import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';

const c = copy.legal;

/**
 * The shell both `/privacy` and `/terms` render into.
 *
 * These two pages exist for a reason narrower than "every site has them": the
 * onboarding form asks a student for their phone number and, optionally, for
 * both parents' phone numbers. A page collecting that on a domain that never
 * says who is collecting it, or why, is what a social-engineering classifier
 * is built to catch — and Google's Search Console flagged this site under
 * «الصفحات المضلّلة» with no sample URLs on 2026-08-06.
 *
 * So the requirement is not decoration. Each page must name the operator, list
 * what is actually collected, and be reachable from the footer of every page
 * and from the form itself. Anything less does not answer the accusation.
 *
 * No `LiquidBackdrop`, no spotlight grid, no shader: these are documents. The
 * marketing surface's atmosphere would read as a landing page dressed up as a
 * policy, which is the opposite of the impression they exist to create.
 */
export function LegalPage({
  title,
  lead,
  crossLinkHref,
  crossLinkLabel,
  children,
}: {
  title: string;
  lead: string;
  crossLinkHref: string;
  crossLinkLabel: string;
  children: ReactNode;
}) {
  return (
    <main>
      <header className="page-head">
        <div className="site-shell">
          <h1 className="page-title">{title}</h1>
          <p className="site-lead">{lead}</p>
          <p className="legal__updated">{c.updatedAt}</p>
        </div>
      </header>

      <div className="site-section">
        <div className="site-shell">
          <article className="legal">{children}</article>

          <nav className="legal__nav">
            <Link className="site-btn site-btn--outline" href={crossLinkHref}>
              {crossLinkLabel}
            </Link>
            <Link className="site-btn site-btn--outline" href="/">
              <ArrowLeft size={16} className="site-btn__arrow" aria-hidden="true" />
              {c.backHome}
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}

/** One heading plus its body. `children` is used when the body needs a link in it. */
export function LegalSection({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <section className="legal__section">
      <h2 className="legal__h2">{title}</h2>
      {body ? <p>{body}</p> : null}
      {children}
    </section>
  );
}

/** A labelled item inside a section — «بيانات الحساب» and what it means. */
export function LegalItem({ term, body }: { term: string; body: string }) {
  return (
    <div className="legal__item">
      <h3 className="legal__h3">{term}</h3>
      <p>{body}</p>
    </div>
  );
}
