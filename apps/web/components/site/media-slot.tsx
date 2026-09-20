import Image from 'next/image';
import { copy } from '@ayman/contracts/copy';
import { getBrandAsset, type BrandAssetKind } from '@/lib/brand-assets';
import { mediaUrl } from '@ayman/ui/branding';
import { tenantName } from '@/lib/tenant';

/**
 * أنهي حقل في إعدادات المدرّس بيغذّي أنهي خانة.
 *
 * `brandAssets` ملفات مكتوبة في الكود ومتجيّتة بـ`aymanOnly`، فأي مدرّس تاني
 * كان بياخد **رسمة بديلة** في المقدمة وفي قسم «المدرّس» وفي صفحة الدخول مهما
 * رفع صور في مكتبته. الخريطة دي هي الوصلة: الصورة اللي رفعها تتعرض مكان
 * الرسمة، وستاك أيمن يفضل على ملفاته زي ما هو.
 *
 * الخانات اللي مش هنا (`logo`, `mark`, `cutout`, وتايلات التراك) مالهاش حقل
 * لسه — بتسقط على الرسمة البديلة، وهي مصمّمة تبقى شكل نهائي مش مكان فاضي.
 */


/**
 * Renders a registered brand photograph, or — while none exists — a designed
 * stand-in occupying the identical box.
 *
 * The point of the indirection is that the fallback is not a grey rectangle
 * waiting to be replaced; each one is composed to carry the section on its own,
 * so the page ships finished today and improves rather than changes when the
 * photography lands. See `lib/brand-assets.ts` for the swap procedure.
 *
 * `priority` should be set on the hero only — it is the LCP element. So should
 * `fetchPriority="high"`, and for a sharper reason: a priority hint is a queue
 * POSITION, not a speed dial. It is worth exactly as much as its exclusivity,
 * so a page where three images claim `high` has told the browser nothing and
 * spent the one lever it had.
 *
 * The two are not the same switch, and Next does not derive one from the other:
 * in `next/dist/shared/lib/get-img-props.js` `priority` only flips
 * `meta.preload`, while `fetchPriority` is an independent, undefaulted prop that
 * is spread onto both the `<img>` and the emitted `<link rel=preload as=image>`.
 * Without it that preload enters Chrome's queue at Low — first in `<head>`, and
 * still behind the render-blocking stylesheets and the early scripts.
 *
 * `quality` overrides next/image's default of 75 for one call site. Whatever is
 * passed here MUST also appear in `images.qualities` in next.config.ts: since
 * Next 16 the optimizer rejects an unlisted `q` with `"q" parameter (quality)
 * of N is not allowed` at request time instead of clamping it, so an undeclared
 * number is a broken image rather than a slightly different one.
 */
export function MediaSlot({
  kind,
  alt,
  className,
  priority = false,
  fetchPriority,
  quality,
  sizes = '100vw',
  tenantKey,
}: {
  kind: BrandAssetKind;
  alt: string;
  /**
   * مفتاح صورة المدرّس، لو رفع واحدة.
   *
   * ⚠️ بروب مش قراءة من `getBranding()` جوّه المكوّن.
   *
   * القراءة هنا كانت بتخلي `MediaSlot` يستورد `@/lib/settings`، وده المودیول
   * اللي تستات البريستات بتستبدله كله بـ`vi.mock`. النتيجة نسختين من
   * `BrandingRead` في نفس الرندر ملهمش علاقة ببعض، و`tsc` بيرد
   * «Two different types with this name exist» — رسالة مالهاش علاقة بالسبب.
   *
   * والبروب أصح وظيفيًا كمان: الصفحة بتقرا `getBranding()` مرة واحدة وبتمرّر،
   * بدل ما كل خانة على الصفحة تنده الكاش لوحدها.
   */
  tenantKey?: string | null;
  className?: string;
  priority?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
  quality?: number;
  sizes?: string;
}) {
  const asset = getBrandAsset(kind);

  /*
   * صورة المدرّس الأول، وملفات أيمن بعدها.
   *
   * على ستاك أيمن `tenantKey` بيفضل فاضي فبيسقط على ملفاته المكتوبة في الكود
   * وما بيتغيّرش عنده ولا بايت. وعلى ستاك تاني `getBrandAsset` بيرجّع
   * `undefined` أصلًا (متجيّت بـ`aymanOnly`) — فالصورة المرفوعة هي الوحيدة.
   */
  if (tenantKey) {
    return (
      <Image
        src={mediaUrl(tenantKey)}
        width={1200}
        height={kind === 'portrait' ? 1600 : 800}
        alt={alt}
        priority={priority}
        fetchPriority={fetchPriority}
        quality={quality}
        sizes={sizes}
        className={className}
      />
    );
  }

  if (asset) {
    return (
      <Image
        src={asset.src}
        width={asset.width}
        height={asset.height}
        alt={alt}
        priority={priority}
        fetchPriority={fetchPriority}
        quality={quality}
        sizes={sizes}
        className={className}
      />
    );
  }

  return (
    <div className={className} data-media-fallback={kind}>
      {kind === 'hero' ? <HeroFallback /> : null}
      {kind === 'cutout' ? <CutoutFallback /> : null}
      {kind === 'portrait' ? <PortraitFallback /> : null}
      {kind === 'logo' ? <LogoFallback /> : null}
      {kind === 'mark' ? <MarkFallback /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The hero stand-in: a lit stage of layered glass panes carrying real syntax.
 *
 * It reads as the subject of the photograph rather than as its absence — the
 * bright wedge sits where the instructor will stand, so swapping the photo in
 * changes what fills the light, not where the light is.
 */
function HeroFallback() {
  return (
    <div className="hero-stage" aria-hidden="true">
      <div className="hero-stage__glow" />
      <div className="hero-stage__beam" />

      {/* ONE pane, not three. The stage is a stand-in for a photograph of a
          person; three floating windows plus a glow plus a beam made it a pile
          of competing objects with no subject, and nothing about that improved
          when other layers were added on top. A single window, lit and
          off-centre, holds the space the photo will take without pretending to
          be the photo. */}
      <div className="hero-stage__pane hero-stage__pane--front">
        <CodePane
          file="you.js"
          lines={[
            [['k', 'let'], ['p', ' '], ['v', 'ready'], ['p', ' = '], ['n', 'true'], ['p', ';']],
            [['k', 'while'], ['p', ' ('], ['v', 'ready'], ['p', ') {']],
            [['p', '  '], ['f', 'learn'], ['p', '();']],
            [['p', '}']],
          ]}
        />
      </div>

      <div className="hero-stage__floor" />
    </div>
  );
}

/**
 * Behind the track cards. Deliberately NOT a fake silhouette: in the reference
 * only a head and shoulders clear the cards, and an invented figure at that size
 * lands in the uncanny valley. A stage spotlight reads as intentional set
 * design, and the real cut-out drops straight into the same lit column.
 */
function CutoutFallback() {
  return (
    <div className="cutout-stage" aria-hidden="true">
      <div className="cutout-stage__shaft" />
      <div className="cutout-stage__pool" />
    </div>
  );
}

/** Tall portrait card: a lit seamless backdrop, waiting for the subject. The
 *  name plate over it comes from the section, not from here. */
function PortraitFallback() {
  return (
    <div className="portrait-stage" aria-hidden="true">
      <div className="portrait-stage__field" />
      <div className="portrait-stage__rings" />
      <span className="portrait-stage__monogram">&lt;/&gt;</span>
    </div>
  );
}

/**
 * A typographic lockup. Unlike the other three this is not really a
 * placeholder — a wordmark set in the product's own type is a legitimate
 * permanent answer, and it stays until a drawn logo is worth the swap.
 */
function LogoFallback() {
  return (
    <span className="wordmark">
      {/*
        ⚠️ `tenantName`, not `copy.site.name` — and this line is why the whole
        fallback family is worth re-reading after any asset gate lands.

        Gating `getBrandAsset` stopped Ayman's PHOTOGRAPH from reaching a second
        instructor's nav. What it did instead was make these fallbacks render
        there for the first time — and they were printing his NAME, ungated,
        because until then they only ever appeared on his own site when a file
        went missing. Closing one leak opened a quieter one inside the very code
        written to cover it: the header read «أيمن أبو العلا» on a stack whose
        every other name gate was correct.
      */}
      <span className="wordmark__name">{tenantName(copy.site.name)}</span>
      <span className="wordmark__tag">{copy.site.tagline}</span>
    </span>
  );
}

/**
 * Stands in for the round nav portrait. The wordmark beside it already says the
 * name, so this stays a quiet initial rather than a second piece of text — and
 * because the real asset IS registered, it renders only if that file goes
 * missing, where a filled circle is the failure that disturbs the header least.
 */
function MarkFallback() {
  return (
    <span className="site-mark__fallback" aria-hidden="true">
      {/* His initial «أ» is still his initial. Same gate, same reason as
          `LogoFallback` above — and on a non-Ayman stack this is no longer the
          rare missing-file case but the DEFAULT render, because the mark is a
          photograph of him and is gated away. */}
      {tenantName(copy.site.name).trim().charAt(0)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

type Token = ['k' | 'v' | 's' | 'n' | 'c' | 'f' | 'a' | 'p', string];

/**
 * A miniature editor chrome used inside the hero stand-in. Highlighting is a
 * hand-written token list rather than a call into Shiki: this is decoration
 * rendered at ~11px behind a blur, and pulling the real highlighter here would
 * cost a WASM payload on the landing's critical path to render text nobody
 * reads.
 */
function CodePane({ file, lines }: { file: string; lines: Token[][] }) {
  return (
    <div className="code-pane">
      <div className="code-pane__bar">
        <i /> <i /> <i />
        <span className="code-pane__file">{file}</span>
      </div>
      <pre className="code-pane__body">
        {lines.map((line, i) => (
          <span className="code-pane__line" key={i}>
            <span className="code-pane__ln">{i + 1}</span>
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
    </div>
  );
}
