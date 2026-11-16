import { copy } from '@ayman/contracts/copy';
import { getDashboard } from '@/lib/dashboard';
import { summarise } from '@/lib/dashboard-view';
import { accountIdentityLabel, getSession } from '@/lib/session';
import { UserAvatar } from './user-avatar';

/**
 * Who is signed in, under the brand on the phone menu's dark band.
 *
 * On a phone the account control in the bar is a 36px face and a chevron, and
 * the drawer — the one screen that lists everything the student can do — is
 * where a shared family phone answers «مين اللي فاتح دلوقتي». So the account
 * is the biggest thing on the band, above the four tiles.
 *
 * What it says is only what is already in hand on this request:
 *   - the name and the phone/email, from `getSession()` — `cache()`-wrapped and
 *     shared with `<AccountMenu>`;
 *   - the overall progress, from `getDashboard()` — `cache()`-wrapped and
 *     shared with `<RailCourses>`, which reads it on every chrome render
 *     anyway, so this costs no round trip.
 * The approved board also showed the school year and a points total. Neither
 * is in either payload, and a third API call on every signed-in page — this
 * slot renders on all of them — to decorate a closed drawer is the wrong
 * bargain on an API already at its per-second throttle. They are left out
 * rather than faked.
 *
 * A Server Component passed down as a node, exactly like `<AccountMenu>`, so
 * the drawer (a client component) never reads the session itself.
 */
export async function DrawerAccount() {
  // A failed read (a throttle, an API mid-restart) draws nothing: this is a
  // layout slot, and a throw from here would take the whole page down over the
  // head of a drawer that is closed on first paint. The brand above it stays.
  const [session, dashboard] = await Promise.all([
    getSession().catch(() => null),
    getDashboard().catch(() => null),
  ]);
  if (!session) return null;

  const identity = accountIdentityLabel(session);
  // A student in nothing yet has no progress to report, and «0%» under their
  // name on their first visit reads as a verdict — so no chip at all.
  const summary = dashboard ? summarise(dashboard) : null;
  const percent = summary && summary.totalLessons > 0 ? summary.overallPercent : null;

  return (
    <div className="dmenu__account">
      <UserAvatar name={session.name} image={session.image} size={56} className="dmenu__avatar" />
      <div className="dmenu__who">
        <p className="dmenu__name">{session.name}</p>
        {/* `dir="ltr"` with logical alignment — an email or an E.164 number
            must not have its dots, @ or + reordered by the RTL paragraph. */}
        {identity ? (
          <p dir="ltr" className="dmenu__id">
            {identity}
          </p>
        ) : null}
        {percent === null ? null : (
          <p className="dmenu__chips">
            <span className="dmenu__chip">
              {copy.nav.menuProgress} <span className="dmenu__chip-num">{percent}%</span>
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
