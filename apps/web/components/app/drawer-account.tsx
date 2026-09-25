import { accountIdentityLabel, getSession } from '@/lib/session';
import { BrandLockup } from '@/components/brand-lockup';
import { UserAvatar } from './user-avatar';

/**
 * Who is signed in, at the HEAD of the phone's navigation drawer.
 *
 * It used to be a card at the foot, under the brand lockup at the top — so the
 * first thing the drawer said was the instructor's name, on a screen about the
 * student's own account. «حط الأكونت اللي فاتح بيه بدل اسم أيمن أبو العلا
 * فوق». The brand is still the first thing on the bar behind the sheet.
 *
 * On a phone the account control in the bar is a 36px face and a chevron, and
 * the drawer — the one screen that lists everything the student can do — never
 * said whose account it was doing it in. A shared family phone is the normal
 * case for this audience, so «مين اللي فاتح دلوقتي» is a real question, and the
 * drawer is where it gets asked.
 *
 * A Server Component passed down as a node, exactly like `<AccountMenu>` beside
 * it, so the drawer (a client component) never reads the session itself.
 * `getSession()` is `cache()`-wrapped, so the two share one request.
 */
export async function DrawerAccount() {
  const session = await getSession();
  // Unreachable behind `proxy.ts`, but a signed-out render must not leave the
  // head of the drawer empty.
  if (!session) return <BrandLockup showTagline={false} />;

  const identity = accountIdentityLabel(session);

  return (
    <div className="drawer__account">
      <UserAvatar name={session.name} image={session.image} size={44} />
      <div className="min-w-0">
        <p className="drawer__account-name">{session.name}</p>
        {/* `dir="ltr"` with logical alignment — an email or an E.164 number
            must not have its dots, @ or + reordered by the RTL paragraph. */}
        {identity ? (
          <p dir="ltr" className="drawer__account-id">
            {identity}
          </p>
        ) : null}
      </div>
    </div>
  );
}
