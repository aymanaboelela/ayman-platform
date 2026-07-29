import Link from 'next/link';
import { MessageCircle, Music2, Users } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { MediaSlot } from '@/components/site/media-slot';
import { FacebookMark, YoutubeMark } from '@/components/site/social-icons';

const c = copy.landing;

/** Placeholder destinations until the real channels are supplied. */
const SOCIAL = {
  youtube: 'https://www.youtube.com/',
  tiktok: 'https://www.tiktok.com/',
  facebook: 'https://www.facebook.com/',
  whatsappChannel: 'https://www.whatsapp.com/',
  facebookGroup: 'https://www.facebook.com/groups/',
  whatsapp: 'https://wa.me/',
} as const;

function External({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {icon}
      <span>{children}</span>
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-shell site-footer__grid">
        <div className="site-footer__brand">
          <MediaSlot kind="logo" alt={copy.site.name} />
          <p className="site-footer__rights">{c.footerRights}</p>
          <p className="site-footer__credit">
            {'<'}Developed by=&quot;<b>{copy.site.instructor}</b>&quot; andPowered={'{'}true{'}'} /
            {'>'}
          </p>
        </div>

        <div className="site-footer__cols">
          <nav className="site-footer__col" aria-label={c.footerPages}>
            <h2 className="site-footer__h">{c.footerPages}</h2>
            <Link href="/">{c.footerHome}</Link>
            <Link href="/courses">{c.coursesCta}</Link>
            <Link href="/register">{c.footerRegister}</Link>
            <Link href="/login">{c.footerLogin}</Link>
          </nav>

          <div className="site-footer__col">
            <h2 className="site-footer__h">{c.footerFollow}</h2>
            <External href={SOCIAL.youtube} icon={<YoutubeMark />}>
              {c.footerYoutube}
            </External>
            <External href={SOCIAL.tiktok} icon={<Music2 size={16} />}>
              {c.footerTiktok}
            </External>
            <External href={SOCIAL.facebook} icon={<FacebookMark />}>
              {c.footerFacebook}
            </External>
            <External href={SOCIAL.whatsappChannel} icon={<MessageCircle size={16} />}>
              {c.footerWhatsappChannel}
            </External>
          </div>

          <div className="site-footer__col">
            <h2 className="site-footer__h">{c.footerCommunity}</h2>
            <External href={SOCIAL.facebookGroup} icon={<Users size={16} />}>
              {c.footerFacebookGroup}
            </External>

            <h2 className="site-footer__h" style={{ marginTop: '1.5rem' }}>
              {c.footerContact}
            </h2>
            <External href={SOCIAL.whatsapp} icon={<MessageCircle size={16} />}>
              {c.footerWhatsapp}
            </External>
          </div>
        </div>
      </div>
    </footer>
  );
}
