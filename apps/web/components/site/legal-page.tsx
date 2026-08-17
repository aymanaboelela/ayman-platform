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
/**
 * Where a reader came FROM, when that is knowable and is not "the site".
 *
 * Exactly one value today (`onboarding`), and it is an enum rather than a raw
 * `?back=` URL on purpose: a caller-supplied redirect target on a public page
 * is an open-redirect waiting to be found, and this page is linked from the
 * one form on the platform that collects phone numbers. A closed set cannot be
 * pointed anywhere the code does not already name.
 */
export type LegalOrigin = 'onboarding';

const ORIGINS: Record<LegalOrigin, { href: string; label: string }> = {
  onboarding: { href: '/onboarding', label: c.backToOnboarding },
};

/** Narrows a raw `?from=` value. Anything unrecognised is simply no origin. */
export function legalOrigin(value: string | undefined): LegalOrigin | null {
  return value === 'onboarding' ? 'onboarding' : null;
}

export function LegalPage({
  title,
  lead,
  crossLinkHref,
  crossLinkLabel,
  origin,
  children,
}: {
  title: string;
  lead: string;
  crossLinkHref: string;
  crossLinkLabel: string;
  /** Set when the reader arrived from a known place — see `LegalOrigin`. */
  origin?: LegalOrigin | null;
  children: ReactNode;
}) {
  const back = origin ? ORIGINS[origin] : null;

  return (
    <main>
      <header className="page-head">
        <div className="site-shell">
          {/*
            ABOVE the title, and this is the whole point of the change.

            These pages had one exit and it was the last thing on them: a
            «الرجوع للرئيسية» button under several screens of policy, pointing
            at the marketing home page. That is fine for someone who came to
            read a policy and is now finished with it. It is a dead end for the
            person this page was actually written for — a student who tapped
            «اعرف بالظبط بنجمع إيه وليه» from the middle of the account form,
            has no interest in the home page, and on a phone cannot see any way
            out without scrolling past the entire document to look for one.
            Reported exactly that way: «مش قادر إن أنا أرجع».

            So the exit is now the first thing on the page as well as the last,
            and when the origin is known it is named — «الرجوع لإكمال بياناتك»,
            not «الرئيسية». The form's answers survive the round trip; see
            `components/onboarding/use-onboarding-draft.ts`.
          */}
          {back ? (
            <p className="legal__back">
              <Link className="site-btn site-btn--outline" href={back.href}>
                <ArrowLeft size={16} className="site-btn__arrow" aria-hidden="true" />
                {back.label}
              </Link>
            </p>
          ) : null}

          <h1 className="page-title">{title}</h1>
          <p className="site-lead">{lead}</p>
          <p className="legal__updated">{c.updatedAt}</p>
        </div>
      </header>

      <div className="site-section">
        <div className="site-shell">
          <article className="legal">{children}</article>

          {/* The known origin leads here too, and leads FIRST — a reader who
              got to the bottom has read the thing they came to read, and
              «الرئيسية» is no more useful to them now than it was at the top. */}
          <nav className="legal__nav">
            {back ? (
              <Link className="site-btn site-btn--outline" href={back.href}>
                <ArrowLeft size={16} className="site-btn__arrow" aria-hidden="true" />
                {back.label}
              </Link>
            ) : null}
            {/* The origin rides along to the OTHER policy page. Without this,
                a student who arrived from the form and then followed «شروط
                الاستخدام» would land one page further from the wizard with the
                way back already forgotten — which is the same dead end, one
                click deeper. */}
            <Link
              className="site-btn site-btn--outline"
              href={origin ? `${crossLinkHref}?from=${origin}` : crossLinkHref}
            >
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
