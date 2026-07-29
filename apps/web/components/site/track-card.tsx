import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export type CodeToken = ['k' | 'v' | 's' | 'n' | 'c' | 'f' | 'a' | 'p', string];

export type TrackCard = {
  href: string;
  file: string;
  branch: string;
  caret: string;
  tag: string;
  title: string;
  body: string;
  cta: string;
  code: CodeToken[][];
  /** The centre card: filled meta panel, progress ticks, solid CTA. */
  active?: boolean;
  /** Ticks lit on the active card, out of eight. */
  progress?: number;
};

const TICKS = 8;

/**
 * A track presented as an editor window: chrome, a few lines of real syntax,
 * a status bar, then the meta panel below it.
 *
 * The code is hand-tokenised rather than run through Shiki. These are four
 * static lines rendered at 12px inside a marketing card — loading the
 * highlighter's WASM payload on the landing's critical path to colour them
 * would cost more than the whole section is worth.
 */
export function TrackCardView({ card }: { card: TrackCard }) {
  return (
    <Link href={card.href} className={`track ${card.active ? 'track--active' : ''}`}>
      <div className="track__editor">
        <div className="track__bar">
          <span className="track__dot" />
          <span className="track__dot" />
          <span className="track__dot" />
          <span className="track__file">{card.file}</span>
        </div>

        <pre className="track__code">
          {card.code.map((line, i) => (
            <span className="track__line" key={i}>
              <span className="track__ln">{i + 1}</span>
              <span>
                {line.map(([tone, text], j) => (
                  <span className={`tok tok--${tone}`} key={j}>
                    {text}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </pre>

        <div className="track__status">
          <span>
            ⌥ main <span className="track__branch">● {card.branch}</span>
          </span>
          <span>{card.caret}</span>
        </div>
      </div>

      <div className="track__meta">
        <p className="track__tag">— {card.tag}</p>
        <h3 className="track__title">{card.title}</h3>
        <p className="track__body">{card.body}</p>

        {card.active ? (
          <div className="track__ticks" aria-hidden="true">
            {Array.from({ length: TICKS }, (_, i) => (
              <span
                className={`track__tick ${i < (card.progress ?? 0) ? 'track__tick--on' : ''}`}
                key={i}
              />
            ))}
          </div>
        ) : null}

        <span className={`track__go ${card.active ? 'site-btn site-btn--light' : ''}`}>
          <ArrowLeft size={16} className="site-btn__arrow" aria-hidden="true" />
          {card.cta}
        </span>
      </div>
    </Link>
  );
}
