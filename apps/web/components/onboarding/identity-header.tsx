import Image from 'next/image';
import { copy } from '@ayman/contracts';

/**
 * Everything a student needs to know before touching the form: which account
 * they are completing, and that the values below came from it and can be
 * changed.
 *
 * This is the one place on the page allowed to be loud. The form itself is
 * deliberately plain — it sits next to the dashboard in the same session, and
 * a second visual language for one screen would read as a different product.
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
      <Avatar name={name} image={image} />
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

/**
 * The photo when there is one, initials when there isn't — an email/password
 * account never has an avatar, and neither does a Google account whose owner
 * never set one, so the fallback is the common case, not the edge case.
 */
function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      <Image
        src={image}
        // Empty alt on purpose: the name is rendered as text immediately
        // beside this, so describing the photo would make a screen reader
        // announce the same person twice.
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-full border border-line object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-surface-4 text-[length:var(--fs-text-base)] font-semibold text-fg-muted"
    >
      {initials(name)}
    </span>
  );
}

/**
 * First letter of each of the first two words. Uses `Array.from` rather than
 * `[0]` because Arabic names are outside the BMP often enough via emoji and
 * combining marks that indexing a JS string can split a character in half and
 * render a replacement box.
 */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
}
