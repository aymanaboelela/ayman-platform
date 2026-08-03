import { copy } from '@ayman/contracts';
import { UserAvatar } from '@/components/app/user-avatar';

/**
 * Everything a student needs to know before touching the form: which account
 * they are completing, and that the values below came from it and can be
 * changed.
 *
 * This is the one place on the page allowed to be loud. The form itself is
 * deliberately plain — it sits next to the dashboard in the same session, and
 * a second visual language for one screen would read as a different product.
 *
 * The avatar itself moved to `components/app/user-avatar.tsx` when the account
 * menu in the shell became the second consumer of "photo, or initials".
 */
export function IdentityHeader({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image: string | null;
}) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-line bg-surface-2 p-4">
      <UserAvatar name={name} image={image} size={48} />
      <div className="min-w-0">
        <p className="truncate text-[length:var(--fs-text-base)] font-semibold text-fg">
          {copy.onboarding.identityGreeting} {name}
        </p>
        {/* `dir="ltr"` with logical text alignment: an email is a Latin string
            and must not have its dots and @ reordered by the RTL paragraph
            direction, but it still has to sit against the inline-start edge
            like everything else in the column. */}
        <p
          dir="ltr"
          className="truncate text-start text-[length:var(--fs-text-sm)] text-fg-muted"
        >
          {email}
        </p>
      </div>
    </div>
  );
}
