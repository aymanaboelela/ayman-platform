import type { FooterContent } from '@/components/site/footer-content';
import { KitFooter } from '../kit/kit-footer';

/** The `taif` footer — the shared kit footer in this preset's look. */
export default function TaifFooter({ content }: { content: FooterContent }) {
  return <KitFooter preset="taif" content={content} />;
}
