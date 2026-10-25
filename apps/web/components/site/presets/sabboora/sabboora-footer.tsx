import type { FooterContent } from '@/components/site/footer-content';
import { KitFooter } from '../kit/kit-footer';

/** The `sabboora` footer — the shared kit footer in this preset's look. */
export default function SabbooraFooter({ content }: { content: FooterContent }) {
  return <KitFooter preset="sabboora" content={content} />;
}
