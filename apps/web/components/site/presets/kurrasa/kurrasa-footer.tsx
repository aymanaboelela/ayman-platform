import type { FooterContent } from '@/components/site/footer-content';
import { KitFooter } from '../kit/kit-footer';

/** The `kurrasa` footer — the shared kit footer in this preset's look. */
export default function KurrasaFooter({ content }: { content: FooterContent }) {
  return <KitFooter preset="kurrasa" content={content} />;
}
