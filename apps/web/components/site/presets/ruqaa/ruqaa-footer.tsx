import type { FooterContent } from '@/components/site/footer-content';
import { KitFooter } from '../kit/kit-footer';

/** The `ruqaa` footer — the shared kit footer in this preset's look. */
export default function RuqaaFooter({ content }: { content: FooterContent }) {
  return <KitFooter preset="ruqaa" content={content} />;
}
