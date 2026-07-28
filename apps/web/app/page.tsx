import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { Reveal, RevealItem } from '@/components/motion/reveal';
import { CodeTyper } from '@/components/landing/code-typer';
import './landing.css';

const c = copy.landing;

function IconSteps() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 18h4v-4H4v4Zm6-4h4v-4h-4v4Zm6-4h4V6h-4v4Z" strokeLinejoin="round" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconProgress() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 15l4-4 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h4v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="lp">
      <div className="lp-shell">
        <header className="lp-topbar">
          <span className="lp-brand">{copy.site.name}</span>
          <Link className="lp-nav-cta" href="/register">
            {c.ctaPrimary} ↗
          </Link>
        </header>

        {/* ---------- hero ---------- */}
        <section className="lp-hero">
          <div className="lp-hero__copy">
            <p className="lp-hero__eyebrow">{c.heroEyebrow}</p>
            {/* The <h1> paints server-side with no animation — it is the LCP
                element. The vermilion underline is pure CSS, the only motion in
                the hero lives in the code figure beside it. */}
            <h1 className="lp-hero__title">
              <span className="lp-mark">{c.heroLine1}</span>
              <br />
              {c.heroLine2}
            </h1>
            <p className="lp-hero__lead">{c.heroLead}</p>
            <div className="lp-cta-row">
              <Link className="lp-btn lp-btn--primary" href="/register">
                {c.ctaPrimary}
              </Link>
              <Link className="lp-btn lp-btn--ghost" href="/courses">
                {c.ctaSecondary}
              </Link>
            </div>
          </div>

          <div className="lp-hero__art">
            <div className="lp-editor">
              <div className="lp-editor__bar">
                <span className="lp-editor__dot" />
                <span className="lp-editor__dot" />
                <span className="lp-editor__dot" />
                <span className="lp-editor__tab">{c.codeCaption}</span>
              </div>
              <pre className="lp-editor__body">
                <CodeTyper />
              </pre>
            </div>
          </div>
        </section>

        {/* ---------- curriculum ---------- */}
        <Reveal className="lp-section">
          <RevealItem>
            <p className="lp-eyebrow">{c.tracksEyebrow}</p>
          </RevealItem>
          <RevealItem>
            <h2 className="lp-h2">{c.tracksTitle}</h2>
          </RevealItem>
          <RevealItem>
            <p className="lp-lead">{c.tracksLead}</p>
          </RevealItem>
        </Reveal>

        {/* ---------- why ---------- */}
        <Reveal className="lp-section">
          <RevealItem>
            <p className="lp-eyebrow">{c.featuresEyebrow}</p>
          </RevealItem>
          <RevealItem>
            <h2 className="lp-h2">{c.featuresTitle}</h2>
          </RevealItem>
          <div className="lp-grid-3">
            <RevealItem className="lp-card">
              <p className="lp-card__num">01</p>
              <span className="lp-card__icon">
                <IconSteps />
              </span>
              <h3 className="lp-card__title">{c.feature1Title}</h3>
              <p className="lp-card__body">{c.feature1Body}</p>
            </RevealItem>
            <RevealItem className="lp-card">
              <p className="lp-card__num">02</p>
              <span className="lp-card__icon">
                <IconCheck />
              </span>
              <h3 className="lp-card__title">{c.feature2Title}</h3>
              <p className="lp-card__body">{c.feature2Body}</p>
            </RevealItem>
            <RevealItem className="lp-card">
              <p className="lp-card__num">03</p>
              <span className="lp-card__icon">
                <IconProgress />
              </span>
              <h3 className="lp-card__title">{c.feature3Title}</h3>
              <p className="lp-card__body">{c.feature3Body}</p>
            </RevealItem>
          </div>
        </Reveal>

        {/* ---------- instructor ---------- */}
        <Reveal className="lp-section">
          <RevealItem>
            <p className="lp-eyebrow">{c.instructorEyebrow}</p>
          </RevealItem>
          <RevealItem className="lp-instructor">
            <span className="lp-avatar" aria-hidden="true">
              أأ
            </span>
            <div>
              <h2 className="lp-card__title" style={{ fontSize: 'var(--fs-title-3)' }}>
                {c.instructorName}
              </h2>
              <p className="lp-card__body" style={{ fontSize: 'var(--fs-text-base)' }}>
                {c.instructorBody}
              </p>
            </div>
          </RevealItem>
        </Reveal>
      </div>

      {/* ---------- final CTA ---------- */}
      <section className="lp-final">
        <Reveal>
          <RevealItem>
            <h2 className="lp-final__title">{c.finalTitle}</h2>
          </RevealItem>
          <RevealItem>
            <p className="lp-lead">{c.finalLead}</p>
          </RevealItem>
          <RevealItem>
            <div className="lp-cta-row" style={{ justifyContent: 'center' }}>
              <Link className="lp-btn lp-btn--primary" href="/register">
                {c.finalCta}
              </Link>
            </div>
          </RevealItem>
        </Reveal>
      </section>
    </main>
  );
}
