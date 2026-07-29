import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { LiquidBackdrop } from '@/components/site/liquid-backdrop';
import { SpotlightGrid } from '@/components/site/spotlight-grid';

const e = copy.essentials;

/**
 * The English column is a list of language keywords, not copy — `Variable` and
 * `Loop` are the same tokens in every localisation of this page, so they stay
 * beside the structure rather than in the Arabic string table. Everything a
 * translator would touch is in `copy.essentials`.
 */
const TERMS = [
  { en: 'Variable', ar: e.t1Ar, body: e.t1Body },
  { en: 'Function', ar: e.t2Ar, body: e.t2Body },
  { en: 'Loop', ar: e.t3Ar, body: e.t3Body },
  { en: 'Array', ar: e.t4Ar, body: e.t4Body },
  { en: 'Condition', ar: e.t5Ar, body: e.t5Body },
  { en: 'Object', ar: e.t6Ar, body: e.t6Body },
  { en: 'Data Type', ar: e.t7Ar, body: e.t7Body },
  { en: 'Operator', ar: e.t8Ar, body: e.t8Body },
  { en: 'Error', ar: e.t9Ar, body: e.t9Body },
  { en: 'Comment', ar: e.t10Ar, body: e.t10Body },
  { en: 'Input / Output', ar: e.t11Ar, body: e.t11Body },
  { en: 'Algorithm', ar: e.t12Ar, body: e.t12Body },
];

export const metadata = { title: e.title };

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
              {TERMS.map((term, i) => (
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
