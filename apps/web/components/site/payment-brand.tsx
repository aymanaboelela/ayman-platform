import Image from 'next/image';

/**
 * Which rail the money travels on. Both are live destinations and they are
 * DIFFERENT numbers — see `ContactSchema.vodafoneCash`.
 */
export type PaymentRail = 'instapay' | 'vodafoneCash';

/**
 * The mark for one payment rail, above the transfer number.
 *
 * ## Why a logo at all
 *
 * The panel asks a student to send real money to a bare phone number. The
 * single most useful thing on it is which APP they are supposed to open —
 * «حوّل على الرقم ده» reads identically whether the destination is a wallet or
 * a bank transfer, and a student who opens the wrong one either fails or sends
 * money somewhere it cannot be reconciled. The mark answers that before the
 * sentence does.
 *
 * That was true when there was one rail. With two it is the whole design: the
 * student is CHOOSING between them, and a name in Arabic text is a far weaker
 * signal than the mark they already know from their own phone.
 *
 * ## One path, everywhere
 *
 * Both places that take money — the course subscribe panel and the book-order
 * panel — render this, so the payment destination can never be described two
 * different ways on two screens.
 *
 * ⚠️ `alt` stays set on both. A brand mark carries no information the
 * surrounding Arabic does not already state, so it is decorative to a screen
 * reader — but a student on a slow connection who gets no image still needs
 * the provider's name, and here that name IS the choice being made.
 *
 * The InstaPay asset is their own wordmark from instapay.eg, trimmed to its
 * ink so the badge can be sized by HEIGHT rather than carrying 512px of
 * padding. The Vodafone one is the 2017 wordmark, and it is used the way a
 * payment rail's mark is always used — to name the destination, not to claim
 * any relationship with the company.
 */
const MARKS: Record<PaymentRail, { src: string; alt: string; width: number; height: number }> = {
  instapay: { src: '/brand/logos/instapay.png', alt: 'InstaPay', width: 369, height: 72 },
  vodafoneCash: { src: '/brand/logos/vodafone.png', alt: 'Vodafone Cash', width: 960, height: 238 },
};

export function PaymentBrand({
  rail = 'instapay',
  className,
}: {
  rail?: PaymentRail;
  className?: string;
}) {
  const mark = MARKS[rail];
  return (
    <Image src={mark.src} alt={mark.alt} width={mark.width} height={mark.height} className={className} />
  );
}
