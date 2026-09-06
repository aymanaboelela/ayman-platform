import Image from 'next/image';

/**
 * The «إنستاباي» badge that sits above the transfer number.
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
 * ## One path, everywhere
 *
 * Both places that take money — the course subscribe panel and the book-order
 * panel — render this, so the payment destination can never be described two
 * different ways on two screens. Swapping providers again is this file plus
 * the copy strings, not a hunt through six components.
 *
 * The asset is InstaPay's own wordmark, taken from instapay.eg and trimmed to
 * its ink with the white field keyed out, so the badge can be sized by HEIGHT
 * like any other mark rather than carrying 512px of padding around it.
 */
export function PaymentBrand({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logos/instapay.png"
      alt="InstaPay"
      width={369}
      height={72}
      // A brand mark carries no information the surrounding copy does not
      // already state in Arabic, so it is decorative to a screen reader —
      // but `alt` stays set, because a student who cannot load images still
      // needs the provider's name.
      className={className}
    />
  );
}
