/*
 * `'use client'`, and it is a formality rather than a change of nature.
 *
 * Four of the six call sites — `student-rail.tsx`, `student-topbar.tsx`
 * (twice), `admin-header.tsx` — are already `'use client'`, so this component
 * has always been compiled into the browser bundle there. The directive makes
 * that true for the other two as well, which is what lets it read
 * `useBrandMark()` instead of being handed a key by six separate callers, two
 * of which sit under a layout that must not become `async`.
 *
 * Nothing it reads is server-only: `getBrandAsset` is gated on `TENANT_KEY`,
 * which `next.config.ts` inlines into the client bundle exactly the way a
 * `NEXT_PUBLIC_` variable is inlined — see the long note in
 * `lib/brand-assets.ts` about the hole that closed.
 */
'use client';

import Image from 'next/image';
import { copy } from '@ayman/contracts/copy';
import { mediaUrl } from '@ayman/ui/branding';
import { getBrandAsset } from '@/lib/brand-assets';
import { useBrandMark } from '@/components/brand-mark-provider';
import { tenantName } from '@/lib/tenant';

/**
 * The product wordmark: the instructor's portrait plus the name and tagline.
 *
 * This is THE swap point the `</>` monogram was holding open — every logged-in
 * surface renders the brand through this one component (app header and its
 * mobile sheet, admin header, admin sidebar, both auth columns), so the mark
 * only ever changes here. The monogram is still the fallback, and still a
 * finished answer rather than a placeholder, for whenever neither the
 * deployment's own uploaded logo nor the registry has a mark.
 *
 * ⚠️ «WHENEVER THE REGISTRY HAS NO ENTRY» USED TO BE THE ONLY CONDITION, and
 * that sentence was measured wrong on every stack but his. `getBrandAsset`
 * gates the `mark` with `aymanOnly()`, so on a second instructor's deployment
 * the monogram was not a rare missing-file case — it was the DEFAULT render,
 * on all five signed-in surfaces, permanently, no matter what that instructor
 * uploaded to /admin/settings. The uploaded mark now fills it; see
 * `components/brand-mark-provider.tsx` for why the key arrives ambiently.
 *
 * ⚠️ It is a CIRCLE here, matching the marketing nav, while the monogram
 * fallback keeps its 11px squircle. That is not an inconsistency: an accent
 * tile with two glyphs in it reads as a logo at any radius, but the same face
 * shown as a circle on the landing page and as a rounded square after login
 * reads as two different marks.
 *
 * `tone` selects which colour scale it reads:
 *   - `surface` — the app tokens, so it inverts with the theme (auth form
 *     column, admin sidebar).
 *   - `ink` — fixed light-on-dark, for the panels that stay dark in BOTH
 *     themes (the auth showcase).
 */
export function BrandLockup({
  tone = 'surface',
  showTagline = true,
  compact = false,
  markKey,
}: {
  tone?: 'surface' | 'ink';
  showTagline?: boolean;
  /**
   * Override the mark this lockup draws, instead of the one the app is
   * deployed under.
   *
   * Nothing in the product passes it — the ambient read through
   * `useBrandMark()` is the whole point, because six callers across three
   * route groups would otherwise each have to remember. It exists for tests,
   * which render this component with no provider above it.
   */
  markKey?: string | null;
  /**
   * Portrait only — the name and tagline are dropped entirely.
   *
   * For the one place that genuinely cannot afford them: the student topbar on
   * a phone. At 360px that bar carries a menu button, this lockup, the
   * notification bell, the theme switch and the account control, and the
   * wordmark «أيمن أبو العلا» is wide enough that the row overflowed and the
   * name rendered ON TOP of the theme switch. The portrait alone still says
   * whose platform this is, the sheet behind the menu button shows the full
   * lockup, and the space it frees is what lets the topbar name the current
   * page instead.
   *
   * Deliberately NOT the default: every other caller has room, and a mark
   * without a name is a weaker brand wherever it is not forced.
   */
  compact?: boolean;
}) {
  /*
   * صورة المدرّس الأول، وملفات أيمن بعدها — نفس ترتيب `<MediaSlot>` بالحرف.
   *
   * على ستاك أيمن المفتاحين دول `null` في `site_settings` (اتشافوا على
   * البرودكشن)، فبيسقط على `getBrandAsset('mark')` — صورته — وما بيتغيّرش عنده
   * ولا بايت. وعلى أي ستاك تاني `getBrandAsset` بيرجّع `undefined` أصلًا
   * (متجيّت بـ`aymanOnly`)، فاللي كان بيترسم هو المونوجرام `</>` في خمس شاشات
   * بعد الدخول: توب‌بار الطالب، السهم الجانبي، هيدر الأدمن، سايدبار الأدمن،
   * وعمود الدخول.
   *
   * والترتيب ده مقصود كمان لو أيمن رفع لوجو بكرة: الرفع فعل صريح، والمفروض
   * يكسب على الملف المكتوب في الكود.
   */
  const ambientMark = useBrandMark();
  const uploaded = markKey === undefined ? ambientMark : markKey;
  const mark = getBrandAsset('mark');
  const hasImage = Boolean(uploaded) || Boolean(mark);

  return (
    <span className="brand" data-tone={tone} data-compact={compact ? 'true' : undefined}>
      {/*
        Decorative in both branches: `.brand__name` states the name right
        beside it, and every call site wraps this in a link that carries its
        own `aria-label`. Announcing the portrait too would say the brand
        twice.
      */}
      <span
        className={hasImage ? 'brand__mark brand__mark--photo' : 'brand__mark'}
        aria-hidden="true"
      >
        {uploaded ? (
          /*
            38×38 declared, which is what `.brand__mark--photo img` renders and
            what `sizes` already said. Square because this box is square: the
            intrinsic ratio of an uploaded file is not in the settings payload
            (the same fact `<BoardMark>` and `<CourseCover>` are both written
            around), and `object-fit: cover` behind `overflow: hidden` performs
            the circular crop on whatever shape arrives.
          */
          <Image src={mediaUrl(uploaded)} width={38} height={38} alt="" sizes="38px" />
        ) : mark ? (
          <Image src={mark.src} width={mark.width} height={mark.height} alt="" sizes="38px" />
        ) : (
          <>&lt;/&gt;</>
        )}
      </span>
      <span className="brand__text">
        {/*
          `instructor`, not `name` — «المهندس أيمن أبو العلا» rather than
          «أيمن أبو العلا». Asked for directly, and the honorific is how he is
          addressed everywhere else on the platform: the about page, the
          landing hero and every meta description already carry it. The wordmark
          was the one surface that dropped it.

          `copy.site.name` stays the bare name and stays correct where it is
          still used — the footer's copyright line, the nav logo's `alt`, the
          `Person` in the JSON-LD. A structured-data `Person.name` takes the
          name, not the title.

          `tenantName()` around it, and this is the widest single swap in the
          gate: every signed-in surface renders the brand through this one
          component — app header and its mobile sheet, admin header, admin
          sidebar, both auth columns — so an ungated read put «المهندس أيمن أبو
          العلا» at the top of five screens belonging to a student who has
          never heard of him, beside another instructor's courses.

          The HONORIFIC goes with the name rather than staying behind: the
          fallback is the whole string, so a second deployment reads
          «TENANT_DISPLAY_NAME», never a half-swapped «المهندس <somebody
          else>». We do not know another instructor's title and must not
          invent one for him.
        */}
        <span className="brand__name">{tenantName(copy.site.instructor)}</span>
        {showTagline ? <span className="brand__tag">{copy.site.tagline}</span> : null}
      </span>
    </span>
  );
}
