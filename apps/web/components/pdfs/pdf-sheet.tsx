import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';
import type { PdfCategory } from '@ayman/contracts/pdfs';
import { pdfsCopy } from '@ayman/contracts/copy/pdfs';

/**
 * The file's picture: the uploaded cover when there is one, otherwise a drawn
 * sheet of paper — folded corner, the category's colour, the title set in it.
 *
 * Drawn rather than left grey because the coverless case IS the normal case
 * (most uploads will have no cover), and a page of identical grey boxes is
 * the «مصمطة» complaint all over again. `data-category` picks the hue in
 * `pdfs.css`; the hue is a category mark on a non-interactive picture, never
 * on what you press.
 */
export function PdfSheet({
  title,
  category,
  coverKey,
  size = 'card',
}: {
  title: string;
  category: PdfCategory;
  coverKey: string | null;
  size?: 'card' | 'hero';
}) {
  if (coverKey) {
    return (
      <div className={`pdf-sheet pdf-sheet--${size} pdf-sheet--cover`} data-category={category}>
        <Image
          src={mediaUrl(coverKey)}
          alt=""
          aria-hidden="true"
          fill
          sizes={size === 'hero' ? '(min-width: 64rem) 22rem, 70vw' : '(min-width: 64rem) 18rem, 45vw'}
          className="pdf-sheet__img"
          priority={size === 'hero'}
        />
        <span className="pdf-sheet__badge" aria-hidden="true">PDF</span>
      </div>
    );
  }

  return (
    <div className={`pdf-sheet pdf-sheet--${size}`} data-category={category} aria-hidden="true">
      <span className="pdf-sheet__fold" />
      <span className="pdf-sheet__kind">{pdfsCopy.category[category]}</span>
      <span className="pdf-sheet__title">{title}</span>
      <span className="pdf-sheet__lines">
        <i />
        <i />
        <i />
      </span>
      <span className="pdf-sheet__badge">PDF</span>
    </div>
  );
}
