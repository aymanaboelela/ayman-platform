import Link from 'next/link';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';
import type { FooterContent } from '@/components/site/footer-content';
import { boardCopy } from './board-copy';

/**
 * «اللوح»'s footer — `branding.landingPreset === 'board'`.
 *
 * ## It is the page's closing block, brought down into the shell
 *
 * `<BoardCta>` makes the argument for the landing page: the opener and the
 * closer are the two places the eye is meant to stop, so the page opens with a
 * solid block curving away from the reader and ends with one curving back.
 * That shape stopped at `/` — every other route in the group got the classic
 * footer, so «اللوح» was a poster on the landing page and an ordinary site
 * everywhere else, with the change happening at the exact moment a visitor
 * clicked «الكورسات».
 *
 * So the footer IS that closing block now, on every page: the deep slab with
 * the arc on its top edge, everything centred, the wordmark at poster size
 * under it. The landing page still renders `<BoardCta>` when the tenant
 * published a `cta` block, and the two reading as one shape closing is the
 * point rather than a collision — same material, same curve, the last of it
 * being the one that carries the legal line.
 *
 * ## The rules it inherits
 *
 * · **Not one `<h*>`.** The footer is streamed BEFORE the page's own content,
 *   so a heading here precedes the document's `<h1>`; an AI-readiness scan
 *   scored the site 0/20 on exactly that in September. Column labels are
 *   `<p class="board-chip">` — the same pill the sections use, which is what
 *   makes them read as headings without being them — and each `<nav>` states
 *   its own name through `aria-label`.
 * · **Nothing personal.** Any instructor can select this preset. The one name
 *   printed here arrives through `tenantName()` in `footer-content.ts`.
 * · **The deep block does not follow `data-theme`.** Same call the banner in
 *   `presets.css` argues for the opener: the block is the BRAND, not a
 *   surface, and a slab that pales in light mode and brightens in dark mode is
 *   three brands depending on a system setting. What follows the theme is the
 *   pale half under it.
 *
 * ## It takes content, not loaders
 *
 * `<SiteFooter>` has already awaited the settings and the entitlements — it
 * has to, to decide which footer to render — so reading them again here would
 * be a second cache entry for the same two answers on every page of the site.
 */
export default function BoardFooter({ content }: { content: FooterContent }) {
  return (
    /*
     * `data-preset='board'` is the only hook, exactly as on `<BoardLanding>`'s
     * `<main>`: every rule in the BOARD section of `presets.css` is scoped
     * under it, and a second handle would be a second thing to keep in step.
     * It also brings the preset's token block with it, which is what lets the
     * rules below name `--board-slab` and `--board-tint` at all — those are
     * declared on this attribute and the footer is a SIBLING of the page, so
     * it inherits none of them without carrying it.
     *
     * ⚠️ Exactly ONE `<footer>` ships in the document: this REPLACES the
     * classic one rather than rendering beside it, which `agent-discovery.e2e.ts`
     * asserts on the delivered HTML.
     */
    <footer className="board-foot" data-preset="board">
      <section className="board-foot__closer">
        <div className="board-shell">
          {/* `board-chip--on-slab` and not the pale default: the chip is
              sitting ON the deep block here, where the tinted version's
              `--board-accent-ink` is a dark accent on a dark fill. */}
          <p className="board-chip board-chip--on-slab">{boardCopy.footer.chip}</p>
          {/* `<p>`, never `<h2>` — see the docblock. */}
          <p className="board-foot__title">{content.cta.title}</p>
          <p className="board-foot__lead">{content.cta.lead}</p>
          <div className="board-foot__actions">
            {/* `.site-btn--light` is the only button that works on this fill:
                `--solid` would be the accent on the accent, and `--outline`
                reads the ambient foreground, which is near-black under the
                light theme. The second action is a plain underlined link
                rather than a second pill — two pills side by side on a poster
                ask the reader to choose, and this block has one thing to
                ask. */}
            <Link className="site-btn site-btn--light" href={content.cta.primary.href}>
              {content.cta.primary.label}
            </Link>
            <Link className="board-foot__alt" href={content.cta.secondary.href}>
              {content.cta.secondary.label}
            </Link>
          </div>
        </div>
      </section>

      <div className="board-foot__body">
        <div className="board-shell">
          <p className="board-foot__mark">{content.name}</p>

          <ul className="board-foot__social" aria-label={content.follow}>
            {content.social.map((item) => {
              const mark = SOCIAL_MARKS[item.key];
              return (
                <li key={item.key}>
                  <a
                    className="board-foot__social-link"
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.label}
                    title={item.label}
                    /* `mark.hex`, not `inkBrand` — this half of the footer
                       follows the theme, so TikTok's official black is correct
                       on it and the cyan variant would fail at 1.5:1. The deep
                       slab above carries no icons, which is why the question
                       does not arise twice. */
                    style={{ ['--brand' as string]: mark.hex }}
                  >
                    <SocialIcon mark={mark} size={19} />
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="board-foot__cols">
            {content.columns.map((column) => (
              <nav className="board-foot__col" key={column.key} aria-label={column.label}>
                <p className="board-chip board-foot__chip">{column.label}</p>

                {column.links.map((link) => (
                  <Link className="board-foot__link" href={link.href} key={link.href}>
                    {link.label}
                  </Link>
                ))}

                {/*
                  Both rendered ONLY when the dashboard holds a real
                  destination — they used to be unconditional on the classic
                  footer and pointed at `https://wa.me/` and
                  `https://www.facebook.com/groups/`, two buttons that looked
                  like features and worked like dead ends. They sit in the
                  ACCOUNT column because that is where a visitor decides
                  whether to hand over a phone number, and the ways to ask a
                  human first belong beside that decision.
                */}
                {column.key === 'account' && content.whatsapp ? (
                  <a
                    className="board-foot__wa"
                    href={content.whatsapp.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ['--brand' as string]: SOCIAL_MARKS.whatsapp.hex }}
                  >
                    <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={16} />
                    {content.whatsapp.label}
                  </a>
                ) : null}

                {column.key === 'account' && content.group ? (
                  <a
                    className="board-foot__link"
                    href={content.group.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {content.group.label}
                  </a>
                ) : null}
              </nav>
            ))}
          </div>

          <p className="board-foot__rights">{content.rights}</p>
        </div>
      </div>
    </footer>
  );
}
