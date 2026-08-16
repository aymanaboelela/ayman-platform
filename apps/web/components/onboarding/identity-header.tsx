import { copy } from '@ayman/contracts/copy';
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
  identity,
  image,
}: {
  name: string;
  /**
   * Email if the account has one, otherwise the phone — see
   * `accountIdentityLabel`. Null is a real state (a Google account before
   * onboarding has an email but no phone; an admin has no phone at all), and
   * the line is omitted rather than rendered blank.
   */
  identity: string | null;
  image: string | null;
}) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-line bg-surface-2 p-4">
      <UserAvatar name={name} image={image} size={48} />
      <div className="min-w-0">
        <p className="truncate text-[length:var(--fs-text-base)] font-semibold text-fg">
          {copy.onboarding.identityGreeting} {name}
        </p>
        {/* `dir="ltr"` with logical text alignment: an email and an E.164
            phone are both Latin strings and must not have their dots, `@` or
            leading `+` reordered by the RTL paragraph direction, but the line
            still has to sit against the inline-start edge like everything
            else in the column. */}
        {identity && (
          <p
            dir="ltr"
            className="truncate text-start text-[length:var(--fs-text-sm)] text-fg-muted"
          >
            {identity}
          </p>
        )}
      </div>
    </div>
  );
}
