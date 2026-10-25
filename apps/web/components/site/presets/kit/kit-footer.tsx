import Link from 'next/link';
import { SOCIAL_MARKS, SocialIcon } from '@/components/site/social-icons';
import type { FooterContent } from '@/components/site/footer-content';
import { KIT_FONT } from './kit-font';
import type { KitPreset } from './kit-preset';

/**
 * The kit presets' footer: a closing call, then the name, the social marks and
 * the link columns. It REPLACES `<SiteFooter>`'s classic markup (one
 * `<footer>` per document) and carries no heading, like every footer here.
 */
export function KitFooter({ preset, content }: { preset: KitPreset; content: FooterContent }) {
  return (
    <footer className={`pk-foot ${KIT_FONT[preset]}`} data-preset={preset}>
      <section className="pk-foot__closer">
        <div className="pk-shell pk-foot__closer-inner">
          <p className="pk-foot__title">{content.cta.title}</p>
          <p className="pk-foot__lead">{content.cta.lead}</p>
          <div className="pk-foot__actions">
            <Link className="pk-btn pk-btn--primary" href={content.cta.primary.href}>
              {content.cta.primary.label}
            </Link>
            <Link className="pk-foot__alt" href={content.cta.secondary.href}>
              {content.cta.secondary.label}
            </Link>
          </div>
        </div>
      </section>

      <div className="pk-shell pk-foot__body">
        <div className="pk-foot__top">
          <p className="pk-foot__name">{content.name}</p>
          {content.social.length > 0 ? (
            <ul className="pk-foot__social" aria-label={content.follow}>
              {content.social.map((item) => (
                <li key={item.key}>
                  <a
                    className="pk-foot__social-link"
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.label}
                  >
                    <SocialIcon mark={SOCIAL_MARKS[item.key]} />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="pk-foot__cols">
          {content.columns.map((column) => (
            <nav className="pk-foot__col" key={column.key} aria-label={column.label}>
              <p className="pk-foot__ct">{column.label}</p>
              <ul className="pk-foot__cl">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link className="pk-foot__l" href={link.href}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="pk-foot__rights">{content.rights}</p>
      </div>
    </footer>
  );
}
