import { MessageCircle } from 'lucide-react';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { cn } from '@ayman/ui/lib/cn';

/**
 * «كلّمه على واتساب» — the one contact affordance in the admin.
 *
 * ## It renders NOTHING when there is no usable number
 *
 * A button that opens `https://wa.me/` lands on WhatsApp's marketing page, and
 * this product has shipped that bug once already (see `site-footer.tsx`). So
 * the null case is absence, not a disabled control: there is nothing an
 * operator could do about a missing number from here anyway.
 *
 * ## Why it normalises first
 *
 * `users.phone_number` is E.164 and needs nothing. The PARENT numbers are not
 * — `student_profiles.father_phone` is free text a fifteen-year-old typed
 * during onboarding, so `01012345678`, `0100 123 4567` and `+201012345678`
 * are all in that column. `normalizeEgyptianPhone` turns the ones that are
 * real numbers into E.164 and answers `null` for the ones that are not, which
 * is exactly the difference between a button that works and a button that
 * opens an error page.
 *
 * `size="sm"` is the row variant — beside a `<dd>` in a definition list, where
 * a full-height button would set the row's line height.
 */
export function WhatsappButton({
  phone,
  label,
  size = 'md',
}: {
  phone: string | null | undefined;
  label: string;
  size?: 'sm' | 'md';
}) {
  const href = waMeHref(phone ? (normalizeEgyptianPhone(phone) ?? phone) : null);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg font-medium',
        // WhatsApp's own green, hardcoded rather than tokenised: it is a brand
        // mark, and it must not follow the admin-settable accent the way
        // `bg-accent` would. Same call `whatsapp-channel-card.tsx` makes.
        'bg-[#25D366] text-[#0B1F14] transition-opacity duration-[160ms] ease-out hover:opacity-90',
        size === 'sm'
          ? 'min-h-9 px-2.5 text-[length:var(--fs-text-xs)]'
          : 'min-h-11 px-4 text-[length:var(--fs-text-sm)]',
      )}
    >
      <MessageCircle className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden="true" />
      {label}
    </a>
  );
}
