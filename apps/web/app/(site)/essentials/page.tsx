import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { buildMetadata } from '@/lib/seo/metadata';
import { LiquidBackdrop } from '@/components/site/liquid-backdrop';
import { SpotlightGrid } from '@/components/site/spotlight-grid';
import { ESSENTIAL_TERMS } from '@/lib/essentials-terms';

const e = copy.essentials;


export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: e.title, description: e.listLead, path: '/essentials' });
}

export default function EssentialsPage() {
  return (
    <main>
      <section className="essentials-hero">
        <LiquidBackdrop className="essentials-hero__fluid" />
        <div className="essentials-hero__wash" aria-hidden="true" />
        <div className="site-shell">
          <span className="site-badge">{e.badge}</span>
          <h1 className="page-title" style={{ marginTop: '1rem' }}>
            {e.title}
          </h1>
          <p className="site-lead">
            {e.leadBefore} <code className="code-chip">{e.leadCode}</code> {e.leadAfter}
          </p>
          <p style={{ marginTop: '2rem' }}>
            <Link className="site-btn site-btn--solid" href="/#years">
              <ArrowLeft size={16} className="site-btn__arrow" aria-hidden="true" />
              {e.cta}
            </Link>
          </p>
        </div>
      </section>

      <section className="site-section">
        <div className="site-shell">
          <h2 className="site-h2" style={{ textAlign: 'center' }}>
            {e.listTitle}
          </h2>
          <p className="site-lead" style={{ textAlign: 'center', maxWidth: '40rem', marginInline: 'auto' }}>
            {e.listLead}
          </p>

          <SpotlightGrid>
            <ul className="terms__grid">
              {ESSENTIAL_TERMS.map((term, i) => (
                <li className="term" data-spot-card key={term.en}>
                  <div className="term__head">
                    <span className="term__en">{term.en}</span>
                    <span className="term__n">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="term__ar">{term.ar}</h3>
                  <p className="term__body">{term.body}</p>
                </li>
              ))}
            </ul>
          </SpotlightGrid>
        </div>
      </section>
    </main>
  );
}
