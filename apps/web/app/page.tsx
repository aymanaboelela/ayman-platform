import Link from 'next/link';
import { CircleCheck, Rocket, Trophy } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { Reveal, RevealItem } from '@/components/motion/reveal';
import { HeroArt } from '@/components/landing/hero-art';
import { Neural } from '@/components/landing/neural';
import './landing.css';

const c = copy.landing;

export default function HomePage() {
  return (
    <main className="lp">
      <div className="lp-shell">
        <header className="lp-topbar">
          <span className="lp-brand">
            منصة <b>{copy.site.name}</b>
          </span>
          <Link className="lp-nav-cta" href="/register">
            {c.ctaPrimary}
          </Link>
        </header>

        {/* ---------- hero ---------- */}
        <section className="lp-hero">
          <div className="lp-hero__copy">
            <span className="lp-hero__eyebrow">{c.heroEyebrow}</span>
            <h1 className="lp-hero__title">
              {c.heroLine1}
              <br />
              <span className="lp-grad">{c.heroLine2}</span>
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
            <HeroArt />
          </div>
        </section>

        {/* ---------- stats ---------- */}
        <div className="lp-stats">
          {[
            [c.statStudents, c.statStudentsLabel],
            [c.statHours, c.statHoursLabel],
            [c.statProjects, c.statProjectsLabel],
            [c.statRating, c.statRatingLabel],
          ].map(([n, l]) => (
            <div className="lp-stat" key={l}>
              <div className="lp-stat__n">{n}</div>
              <div className="lp-stat__l">{l}</div>
            </div>
          ))}
        </div>

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
              <span className="lp-card__icon" style={{ ['--c' as string]: 'var(--cyan)' }}>
                <Rocket size={24} strokeWidth={2.2} />
              </span>
              <h3 className="lp-card__title">{c.feature1Title}</h3>
              <p className="lp-card__body">{c.feature1Body}</p>
            </RevealItem>
            <RevealItem className="lp-card">
              <p className="lp-card__num">02</p>
              <span className="lp-card__icon" style={{ ['--c' as string]: 'var(--violet)' }}>
                <CircleCheck size={24} strokeWidth={2.2} />
              </span>
              <h3 className="lp-card__title">{c.feature2Title}</h3>
              <p className="lp-card__body">{c.feature2Body}</p>
            </RevealItem>
            <RevealItem className="lp-card">
              <p className="lp-card__num">03</p>
              <span className="lp-card__icon" style={{ ['--c' as string]: 'var(--pink)' }}>
                <Trophy size={24} strokeWidth={2.2} />
              </span>
              <h3 className="lp-card__title">{c.feature3Title}</h3>
              <p className="lp-card__body">{c.feature3Body}</p>
            </RevealItem>
          </div>
        </Reveal>

        {/* ---------- live neural (real 3D) ---------- */}
        <Reveal className="lp-section lp-showcase">
          <div className="lp-showcase__copy">
            <RevealItem>
              <p className="lp-eyebrow">{c.aiEyebrow}</p>
            </RevealItem>
            <RevealItem>
              <h2 className="lp-h2">{c.aiTitle}</h2>
            </RevealItem>
            <RevealItem>
              <p className="lp-lead">{c.aiLead}</p>
            </RevealItem>
          </div>
          <RevealItem>
            <Neural />
          </RevealItem>
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
