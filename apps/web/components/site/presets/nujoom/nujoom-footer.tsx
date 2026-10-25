import type { FooterContent } from '@/components/site/footer-content';
import { KitFooter } from '../kit/kit-footer';

/** The `nujoom` footer — the shared kit footer in this preset's look. */
export default function NujoomFooter({ content }: { content: FooterContent }) {
  return <KitFooter preset="nujoom" content={content} />;
}
