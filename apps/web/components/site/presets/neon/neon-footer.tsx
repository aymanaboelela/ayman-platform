import Link from 'next/link';
import { SOCIAL_MARKS, SocialIcon, inkBrand } from '@/components/site/social-icons';
import type { FooterContent } from '@/components/site/footer-content';
import { Mono, NeonCommand, NeonWindow } from './neon-chrome';
import { FOOTER } from './neon-copy';

/**
 * «الترمينال»'s footer — `branding.landingPreset === 'neon'`.
 *
 * ## Why this exists as a component at all
 *
 * Because the footer is in the SHELL, not in the page. `(site)/layout.tsx`
 * renders it under every route in the group — `/courses`, `/books`, `/about`,
 * `/news`, `/links`, `/essentials` and the prerendered 404 — so before this
 * file there was exactly one footer on the platform and it was the classic
 * one. On this preset that produced a page which contradicted itself: the
 * `:has()` block in `presets.css` repoints the shell's tokens so the header
 * and footer follow the dark landing page, and that selector can only match on
 * `/`. A tenant on this preset therefore had a footer that was dark on the
 * landing page and light on every other one, from the same markup, with
 * nothing in either file to suggest why.
 *
 * This footer does not depend on that block at all. It carries its own ground
 * (`data-preset='neon'` puts `--neon-*`, the dark fill and `color-scheme: dark`
 * on the element itself), so it renders identically on `/` and on `/courses`,
 * and it will keep doing so if that `:has()` rule is ever narrowed or removed.
 *
 * ## The rules it inherits from the rest of the preset
 *
 * · **Not one `<h*>`.** Every heading was taken out of the classic footer on
 *   2026-09-13 and the reason applies here word for word: the footer is
 *   streamed BEFORE the page's own content, so an `<h2>` here is an `<h2>`
 *   that precedes the document's `<h1>`. An AI-readiness scan scored the site
 *   0/20 on exactly that. Column labels are `<p>` and each landmark states its
 *   own name with `aria-label`.
 * · **Every Latin run goes through `<Mono>`.** `// account` dropped bare into
 *   an RTL line renders `account //`, silently — see `<Mono>`'s own note.
 * · **Nothing personal.** No name is written here: the one that prints arrives
 *   through `tenantName()` in `footer-content.ts`, and any instructor can
 *   select this preset.
 *
 * ## It takes content, not loaders
 *
 * `<SiteFooter>` has already awaited the settings and the entitlements — it
 * has to, to decide which footer to render — so a second read here would be a
 * second cache entry for the same two answers on every page of the site. It
 * also keeps this directory free of `copy.landing`, which `neon-landing.test.ts`
 * enforces and which is the right rule: that table is the classic landing page
 * written out, and a preset that read from it would be rendering his words.
 */
export default function NeonFooter({ content }: { content: FooterContent }) {
  return (
    /*
     * `data-preset='neon'` and no companion class, for the reason
     * `<NeonLanding>` gives about its own `<main>`: two handles for one thing
     * is two things to keep in step, and the day one is used in a selector and
     * the other is not is the day a rule stops matching for a reason nobody
     * can see in the markup. The attribute also brings the preset's root block
     * with it — the tokens, the dark ground, the scoped margin reset and the
     * circuit traces — so nothing below has to redeclare any of them.
     *
     * ⚠️ Exactly ONE `<footer>` ships in the document: this REPLACES the
     * classic one rather than rendering beside it, which `agent-discovery.e2e.ts`
     * asserts on the delivered HTML.
     */
    <footer className="neon-foot" data-preset="neon">
      <div className="neon-shell neon-foot__inner">
        {/*
          The closer, as the one window on the page that is lit at rest. Same
          argument `<NeonCta>` makes for the landing page's last frame: on a
          ground this dark a closing panel cannot be distinguished by a change
          of background, only by light. It is `register.sh` rather than
          `start.sh` because the landing page's own closer already claims that
          filename, and two windows naming one file reads as a duplicated card.
        */}
        <div className="neon-foot__cta">
          <NeonWindow file={FOOTER.file} lit>
            <p className="neon-foot__cta-title">{content.cta.title}</p>
            <p className="neon-foot__cta-lead">{content.cta.lead}</p>
            <div className="neon-foot__cta-cmds">
              <NeonCommand href={content.cta.primary.href} variant="run">
                {content.cta.primary.label}
              </NeonCommand>
              <NeonCommand href={content.cta.secondary.href} variant="path">
                {content.cta.secondary.label}
              </NeonCommand>
            </div>
          </NeonWindow>
        </div>

        <div className="neon-foot__grid">
          <div className="neon-foot__brand">
            <p className="neon-foot__mark">
              <Mono className="neon-foot__prompt" hidden>
                {FOOTER.prompt}
              </Mono>
              <span className="neon-foot__name">{content.name}</span>
            </p>

            <ul className="neon-foot__social" aria-label={content.follow}>
              {content.social.map((item) => {
                const mark = SOCIAL_MARKS[item.key];
                return (
                  <li key={item.key}>
                    <a
                      className="neon-foot__social-link"
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.label}
                      title={item.label}
                      /* `inkBrand`, NOT `mark.hex` — this surface is dark in
                         both themes. TikTok's official colour is `#000000`,
                         which measures 1.08:1 here; the registry carries the
                         cyan its own dark UI uses (14.17:1) for exactly this
                         case. The classic footer follows the theme and is
                         right to read `hex` instead. */
                      style={{ ['--brand' as string]: inkBrand(mark) }}
                    >
                      <SocialIcon mark={mark} size={18} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {content.columns.map((column) => (
            <nav className="neon-foot__col" key={column.key} aria-label={column.label}>
              {/* `<p>`, never a heading — see the docblock. The marker above
                  the Arabic label is the preset's whole voice: a section of a
                  file, named the way a comment names one. */}
              <p className="neon-foot__h">
                <Mono className="neon-foot__marker" hidden>
                  {`// ${FOOTER.markers[column.key]}`}
                </Mono>
                <span>{column.label}</span>
              </p>

              {column.links.map((link) => (
                <Link className="neon-foot__link" href={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}

              {/*
                Both are rendered ONLY when the dashboard holds a real
                destination, and they belong to the ACCOUNT column for the
                reason the links above it do: this is where a visitor decides
                whether to hand over a phone number, so the ways to ask a human
                first sit beside that decision rather than three columns away.
              */}
              {column.key === 'account' && content.whatsapp ? (
                <a
                  className="neon-foot__wa"
                  href={content.whatsapp.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ['--brand' as string]: inkBrand(SOCIAL_MARKS.whatsapp) }}
                >
                  <SocialIcon mark={SOCIAL_MARKS.whatsapp} size={15} />
                  {content.whatsapp.label}
                </a>
              ) : null}

              {column.key === 'account' && content.group ? (
                <a
                  className="neon-foot__link"
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

        <div className="neon-foot__bar">
          <p className="neon-foot__rights">{content.rights}</p>
          {/* The document ends rather than stops. `aria-hidden`, because a
              screen reader announcing "slash slash E O F" after the copyright
              line is noise at the one point the reader is leaving. */}
          <Mono className="neon-foot__eof" hidden>
            {FOOTER.eof}
          </Mono>
        </div>
      </div>
    </footer>
  );
}
