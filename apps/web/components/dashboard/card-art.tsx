/**
 * The banner drawings at the top of the dashboard's aside cards.
 *
 * ## Why these exist
 *
 * «غير الأيكونز، يبقى فيه صور، لأن بجد مش فاهم حاجة». Each of these cards used
 * to open with a 16px lucide glyph in a 40px well — at that size a lightbulb, a
 * trophy and a megaphone are the same grey smudge, so the glyph carried no
 * information at all and the card read as a paragraph with a bullet in front of
 * it.
 *
 * ## Why drawn rather than photographed
 *
 * The same trade `SpotIllustration` and `CourseArt` already make on this
 * surface, and it is worth restating because the ask was literally for photos:
 *
 *   · **It re-themes.** Every colour here is a token, so one file covers light
 *     and dark. A raster banner needs two, and the second one is always the one
 *     nobody notices is wrong.
 *   · **It costs no request** on the screen that has to paint fastest — the
 *     dashboard already makes nine parallel API reads, and its own comments
 *     keep counting them against the `short` throttle.
 *   · **They read as one family.** Three stock photographs are three different
 *     photographers, three different crops and three different lighting
 *     temperatures sitting in one 23rem column. Same geometry, same palette and
 *     the same ember/amber split is what makes these three look like they
 *     belong to the product rather than to a template.
 *
 * ## The palette rule they obey
 *
 * Structure in ember (`--e-*`), exactly one live element in amber (`--a-*`),
 * and one decorative hue per scene from the ramp `lib/subject-art.ts`
 * documents — which that file permits precisely because these are
 * non-interactive category marks. Nothing in a banner is pressable, so nothing
 * here competes with the page's one primary action.
 *
 * `aria-hidden` on all of them: every banner sits directly above a heading that
 * says the same thing in words.
 */

export type CardArtName = 'channel' | 'tip' | 'awards' | 'mastery';

/**
 * 16/6, matching `.aside-card__art`'s own `aspect-ratio` — the viewBox and the
 * CSS have to agree or the drawing letterboxes inside its own banner.
 */
const VIEW_BOX = '0 0 320 120';

export function CardArt({ name }: { name: CardArtName }) {
  return (
    <svg
      className="aside-card__art"
      viewBox={VIEW_BOX}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      {name === 'channel' ? (
        <Channel />
      ) : name === 'tip' ? (
        <Tip />
      ) : name === 'mastery' ? (
        <Mastery />
      ) : (
        <Awards />
      )}
    </svg>
  );
}

/**
 * A shared backdrop so the four scenes sit on the same ground rather than each
 * inventing its own. `--card-art-h` is written by the scene: it is the one
 * decorative hue that scene is allowed, and it tints only this wash.
 */
function Ground({ hue }: { hue: number }) {
  return (
    <g style={{ '--card-art-h': hue } as React.CSSProperties}>
      <rect x="0" y="0" width="320" height="120" className="card-art__field" />
      {/* Two soft arcs, bottom-left and top-right, so the flat band has a
          direction to it. Alpha fills — see `.card-art__wash`. */}
      <circle cx="34" cy="112" r="62" className="card-art__wash" />
      <circle cx="292" cy="10" r="48" className="card-art__wash" />
    </g>
  );
}

/**
 * «قناة الواتساب» — a phone with three broadcast arcs leaving it.
 *
 * Deliberately NOT the WhatsApp logotype at banner size. The card already
 * carries the real mark, in brand green, on the row underneath; a 120px-tall
 * repeat of it would be the loudest thing on the dashboard and it would be
 * making a claim about affiliation that a drawing should not make. What this
 * says instead is "announcements reach you here", which is the card's actual
 * argument — see `WhatsappChannelCard` for why the block exists at all.
 */
function Channel() {
  return (
    <g>
      <Ground hue={150} />

      {/* The handset. */}
      <rect x="126" y="24" width="68" height="88" rx="10" className="card-art__solid" />
      <rect x="134" y="34" width="52" height="66" rx="4" className="card-art__screen" />

      {/* Two message bubbles on the screen — the thing being broadcast. */}
      <rect x="140" y="42" width="34" height="12" rx="6" className="card-art__line" />
      <rect x="140" y="60" width="28" height="12" rx="6" className="card-art__line" />
      <rect x="140" y="78" width="40" height="12" rx="6" className="card-art__accent-fill" />

      {/* The arcs. Three, growing outward on both sides, so the drawing reads
          as "leaving the phone" rather than "decorating it". */}
      <g className="card-art__mark">
        <path d="M206 68 a22 22 0 0 0 0 -28" />
        <path d="M220 78 a38 38 0 0 0 0 -48" />
        <path d="M234 88 a54 54 0 0 0 0 -68" />
        <path d="M114 68 a22 22 0 0 1 0 -28" />
        <path d="M100 78 a38 38 0 0 1 0 -48" />
        <path d="M86 88 a54 54 0 0 1 0 -68" />
      </g>
    </g>
  );
}

/** «نصيحة اليوم» — a desk lamp over an open book, and the lamp is lit. */
function Tip() {
  return (
    <g>
      <Ground hue={45} />

      {/* The open book: two leaves meeting at a spine. */}
      <path
        d="M96 96 L96 66 Q126 56 156 66 L156 96 Q126 86 96 96 Z"
        className="card-art__solid"
      />
      <path
        d="M156 96 L156 66 Q186 56 216 66 L216 96 Q186 86 156 96 Z"
        className="card-art__solid"
      />
      <path d="M156 66 L156 96" className="card-art__mark" />
      <g className="card-art__mark">
        <path d="M106 72 h34" />
        <path d="M106 80 h28" />
        <path d="M172 72 h34" />
        <path d="M172 80 h28" />
      </g>

      {/* The bulb — the ONE amber element, and it is amber in its "this is
          live" sense rather than its "press me" sense, same as the progress
          ring on the band above. */}
      <circle cx="156" cy="34" r="15" className="card-art__accent-fill" />
      <path d="M150 46 h12" className="card-art__accent-stroke" />
      <path d="M152 50 h8" className="card-art__accent-stroke" />
      {/* Rays. */}
      <g className="card-art__accent-stroke">
        <path d="M156 8 v-4" />
        <path d="M133 18 l-4 -3" />
        <path d="M179 18 l4 -3" />
        <path d="M124 40 h-6" />
        <path d="M188 40 h6" />
      </g>
    </g>
  );
}

/** «إنجازاتك» — three podium blocks with a cup on the tallest. */
function Awards() {
  return (
    <g>
      <Ground hue={280} />

      {/* Podium. The middle block is the tallest, which is what makes three
          rectangles read as a podium rather than as a bar chart. */}
      <rect x="88" y="80" width="52" height="32" rx="4" className="card-art__line" />
      <rect x="140" y="62" width="52" height="50" rx="4" className="card-art__solid" />
      <rect x="192" y="90" width="52" height="22" rx="4" className="card-art__line" />
      <g className="card-art__mark">
        <path d="M104 96 h20" />
        <path d="M208 102 h20" />
      </g>

      {/* The cup. */}
      <path d="M150 20 h32 v14 a16 16 0 0 1 -32 0 Z" className="card-art__accent-fill" />
      <g className="card-art__accent-stroke">
        <path d="M150 24 h-9 a9 9 0 0 0 9 9" />
        <path d="M182 24 h9 a9 9 0 0 1 -9 9" />
        <path d="M166 50 v6" />
        <path d="M156 56 h20" />
      </g>
    </g>
  );
}

/** «ذاكر ده» — a magnifier over a short ranked list. */
function Mastery() {
  return (
    <g>
      <Ground hue={225} />

      <rect x="80" y="28" width="104" height="70" rx="6" className="card-art__solid" />
      <g className="card-art__mark">
        <path d="M94 46 h60" />
        <path d="M94 60 h44" />
        <path d="M94 74 h52" />
      </g>
      {/* The one row being looked at. */}
      <rect x="90" y="54" width="52" height="12" rx="6" className="card-art__accent-fill" />

      <circle cx="204" cy="60" r="30" className="card-art__lens" />
      <circle cx="204" cy="60" r="20" className="card-art__line" />
      <path d="M226 82 l16 16" className="card-art__accent-stroke" />
    </g>
  );
}
