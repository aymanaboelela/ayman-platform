'use client';

import type { ReactNode } from 'react';
import { recordWhatsappOpened } from '@/lib/whatsapp-opened';

/**
 * The anchor inside `<WhatsappChannelCard>`, split out for ONE reason: the
 * press has to be recorded, and a press handler needs a client component.
 *
 * ## Why the card is not just marked `'use client'`
 *
 * Because everything else on it — the copy, the brand colours, the WhatsApp
 * mark — is static, and shipping it to the browser to attach one listener
 * would put an SVG path and a colour table into the dashboard's client bundle
 * for nothing. The card stays a Server Component and hands its children to
 * this shell, which is eleven lines and one `onClick`.
 *
 * ## What the recording is for
 *
 * «رسايل م. أيمن» invites students to the channel every few weeks, and this is
 * the signal that lets it stop asking someone who has already gone. It is
 * fire-and-forget — see `recordWhatsappOpened`; a lost call costs one more
 * reminder in three weeks, and nothing about the navigation waits on it.
 */
export function WhatsappChannelLink({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={recordWhatsappOpened}
      className={className}
      style={style}
    >
      {children}
    </a>
  );
}
