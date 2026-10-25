import type { FooterContent } from '@/components/site/footer-content';
import { KitFooter } from '../kit/kit-footer';

/** The `rihla` footer — the shared kit footer in this preset's look. */
export default function RihlaFooter({ content }: { content: FooterContent }) {
  return <KitFooter preset="rihla" content={content} />;
}
