import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getBrandAsset, type BrandAssetKind } from '@/lib/brand-assets';

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
  /**
   * The card's poster, if one has been registered for it in `brand-assets.ts`.
   *
   * Absent — or named but not yet registered — and the card keeps the editor
   * window built from `code` below. That is why `code` is still required on
   * every card: it is the state the section shipped in and the state a card
   * returns to, not a placeholder.
   */
  image?: BrandAssetKind;
  /** The centre card: filled meta panel, progress ticks, solid CTA. */
  active?: boolean;
  /** Ticks lit on the active card, out of eight. */
  progress?: number;
};

const TICKS = 8;

/**
 * A track presented as its poster — or, until that poster exists, as an editor
 * window: chrome, a few lines of real syntax, a status bar. Either way the meta
 * panel sits under it.
 *
 * ## Two heads, one card, and the switch is the registry
 *
 * «التلاتة cards دي هجيب لك صورة تحطها» — the posters are being drawn one at a
 * time, so the card reads `brand-assets.ts` and takes whichever head it can
 * actually fill. There is no `hasImage` prop and no placeholder: an
 * unregistered poster is not a gap, because the editor window it falls back to
 * is a finished thing that has been on the page since the section shipped.
 *
 * Both heads occupy the card's full width and the meta panel is identical
 * under either, so a card that gains its poster changes height and nothing
 * else — see `BRAND_ASSET_RATIO` for why the image is not cropped to match.
 *
 * The code is hand-tokenised rather than run through Shiki. These are four
 * static lines rendered at 12px inside a marketing card — loading the
 * highlighter's WASM payload on the landing's critical path to colour them
 * would cost more than the whole section is worth.
 */
export function TrackCardView({ card }: { card: TrackCard }) {
  const poster = card.image ? getBrandAsset(card.image) : undefined;

  return (
    <Link href={card.href} className={`track ${card.active ? 'track--active' : ''}`}>
      {poster ? (
        <div className="track__cover">
          {/*
            `alt=""`: the poster's own artwork repeats the card's title, which
            the <h3> below states in text — a description here would have a
            screen reader read the same course name twice in one link.

            No `priority`. This sits most of a screen below the fold, behind a
            dragon that has to fly in before it is looked at, and the hero
            above it is the page's LCP element — see `<MediaSlot>` on why a
            second claim on the queue is worth less than none.
          */}
          <Image
            src={poster.src}
            width={poster.width}
            height={poster.height}
            alt=""
            sizes="(max-width: 64rem) 92vw, 31vw"
            className="track__cover-img"
          />
        </div>
      ) : (
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
      )}

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
