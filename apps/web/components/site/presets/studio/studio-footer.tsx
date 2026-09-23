import Link from 'next/link';

import type { FooterContent } from '@/components/site/footer-content';

/**
 * «الاستوديو»'s footer.
 *
 * ## It is quiet, and that is the decision
 *
 * `<BoardFooter>` absorbs the closing call to action because that preset's
 * opener and its footer were two deep slabs making the same argument twice.
 * This page does not have that problem: `<StudioCta>` is the ONE dark band on
 * a light page and it lands immediately above here, so a footer that repeated
 * the invitation would be the second ask in two screens — and it would also
 * spend the contrast this preset saves for exactly one moment.
 *
 * So this is a directory: where to go, how to get in touch, whose site it is.
 * The `cta` half of `FooterContent` is deliberately not read.
 *
 * ⚠️ Exactly ONE `<footer>` ships in the document — this REPLACES the default,
 * it does not sit inside it.
 *
 * ## No heading in here
 *
 * `landing-preset.test.ts` asserts this across every preset footer. The column
 * titles are `<p>`, not `<h2>`: a footer's «الصفحات» is a label on a list, and
 * promoting it to a heading puts four more entries into the document outline
 * that anyone navigating by headings has to walk past to leave the page.
 */
export default function StudioFooter({ content }: { content: FooterContent }) {
  return (
    <footer className="st-foot" data-preset="studio">
      <div className="st-shell st-foot__inner">
        <div className="st-foot__top">
          <p className="st-foot__name">{content.name}</p>

          {content.social.length > 0 ? (
            <ul className="st-foot__social" aria-label={content.follow}>
              {content.social.map((link) => (
                <li key={link.href}>
                  <a
                    className="st-foot__s"
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="st-foot__cols">
          {content.columns.map((column) => (
            <nav className="st-foot__col" key={column.key} aria-label={column.label}>
              <p className="st-foot__ct">{column.label}</p>
              <ul className="st-foot__cl">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link className="st-foot__l" href={link.href}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {content.whatsapp || content.group ? (
          <div className="st-foot__contact">
            {content.whatsapp ? (
              <a
                className="st-btn st-btn--quiet"
                href={content.whatsapp.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                {content.whatsapp.label}
              </a>
            ) : null}
            {content.group ? (
              <a
                className="st-btn st-btn--quiet"
                href={content.group.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                {content.group.label}
              </a>
            ) : null}
          </div>
        ) : null}

        <p className="st-foot__rights">{content.rights}</p>
      </div>
    </footer>
  );
}
