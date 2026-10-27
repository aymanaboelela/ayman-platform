import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, CircleDollarSign, Gift, PauseCircle, Sparkles, UserPlus, Users, Wallet } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { referralsCopy as c } from '@ayman/contracts/copy/referrals';
import { formatCopy } from '@ayman/contracts/format';
import { MyReferralsSchema, type ReferralFriendStatus } from '@ayman/contracts/referrals';
import { apiGetAuthedOrNotFound } from '@/lib/api-server';
import { formatEGP } from '@/lib/price';
import { SITE_URL } from '@/lib/seo/site-url';
import { tenantName } from '@/lib/tenant';
import { InviteArt } from '@/components/referrals/invite-art';
import { InviteShare } from '@/components/referrals/invite-share';
import '@/components/referrals/referrals.css';

export const metadata: Metadata = { title: c.pageTitle };

const DAY = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' });

/** One hue per friend, from the name — the same friend keeps the same colour. */
function hueOf(name: string): number {
  let value = 0;
  for (let index = 0; index < name.length; index += 1) value = (value * 31 + name.charCodeAt(index)) % 6;
  return value + 1;
}

const STATUS_ICON: Record<ReferralFriendStatus, typeof Gift> = {
  joined: UserPlus,
  credited: BadgeCheck,
  reversed: CircleDollarSign,
  closed: PauseCircle,
};

/**
 * «دعوة صحابك» — the student's own share link, what it has earned, and the
 * friends who came through it.
 *
 * The read is LIVE (`apiGetAuthedOrNotFound`, never cached): this is the page
 * a student opens right after «مكافأة دعوة» lands, and a cached count would
 * say nothing happened. A stack without `referrals` answers 404 at the API,
 * and so does this page.
 *
 * The WhatsApp message is composed HERE, on the server, from the copy table:
 * `{platform}` is `tenantName(copy.site.name)` — the stack's own name, never a
 * literal — so a teacher's students forward their teacher's platform.
 */
export default async function InvitePage() {
  const data = await apiGetAuthedOrNotFound('/api/me/referrals', MyReferralsSchema);

  const url = `${SITE_URL}/r/${data.code}`;
  const reward = formatEGP(data.referrerRewardCents);
  const friendReward = formatEGP(data.friendRewardCents);
  const hasFriendReward = data.friendRewardCents > 0;
  const message = formatCopy(hasFriendReward ? c.shareMessage : c.shareMessageNoFriend, {
    platform: tenantName(copy.site.name),
    friend: friendReward,
    url,
  });

  const stats = [
    { key: 'joined', label: c.statJoined, value: data.counts.joined, Icon: Users },
    { key: 'paid', label: c.statPaid, value: data.counts.paid, Icon: Wallet },
    { key: 'credited', label: c.statCredited, value: data.counts.credited, Icon: BadgeCheck },
  ] as const;

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <section className="rf-hero" aria-labelledby="rf-title">
        <div>
          <span className="rf-hero__pill">
            <Sparkles className="size-4" aria-hidden="true" />
            {c.eyebrow}
          </span>
          <h1 id="rf-title" className="rf-hero__title">
            {formatCopy(c.heroTitle, { amount: reward })}
          </h1>
          <p className="rf-hero__lead">
            {formatCopy(hasFriendReward ? c.heroLead : c.heroLeadNoFriend, { amount: reward, friend: friendReward })}
          </p>
        </div>
        <InviteArt className="rf-hero__art" />
      </section>

      {!data.active ? (
        <section className="rf-paused" role="status">
          <PauseCircle className="size-6 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="rf-paused__title">{c.inactiveTitle}</h2>
            <p>{c.inactiveBody}</p>
          </div>
        </section>
      ) : null}

      <div className="rf-lift relative mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid gap-6">
          <section className="rf-card">
            <InviteShare url={url} message={message} />
            <p className="rf-code">
              {c.codeLabel}
              <span className="rf-code__value" dir="ltr">
                {data.code}
              </span>
            </p>
          </section>

          <section className="rf-card" aria-labelledby="rf-stats-title">
            <h2 id="rf-stats-title" className="rf-section-title">
              <Sparkles className="size-5 text-[var(--viz-1)]" aria-hidden="true" />
              {c.statsTitle}
            </h2>
            <div className="rf-stats">
              {stats.map(({ key, label, value, Icon }) => (
                <div key={key} className={`rf-stat rf-stat--${key}`}>
                  <Icon className="rf-stat__icon" aria-hidden="true" />
                  <span className="rf-stat__value">{value.toLocaleString('ar-EG-u-nu-latn')}</span>
                  <span className="rf-stat__label">{label}</span>
                </div>
              ))}
              <div className="rf-stat rf-stat--earned">
                <CircleDollarSign className="rf-stat__icon" aria-hidden="true" />
                <span className="rf-stat__value">
                  <span className="rf-num">{formatEGP(data.earnedCents)}</span> {c.currency}
                </span>
                <span className="rf-stat__label">{c.statEarned}</span>
              </div>
            </div>
          </section>

          <section className="rf-card" aria-labelledby="rf-friends-title">
            <h2 id="rf-friends-title" className="rf-section-title">
              <Users className="size-5 text-[var(--viz-3)]" aria-hidden="true" />
              {c.friendsTitle}
            </h2>
            {data.friends.length === 0 ? (
              <p className="rf-empty">
                <UserPlus className="size-5 shrink-0" aria-hidden="true" />
                {c.friendsEmpty}
              </p>
            ) : (
              <ul className="rf-friends">
                {data.friends.map((friend, index) => {
                  const Icon = STATUS_ICON[friend.status];
                  return (
                    <li key={`${friend.joinedAt}-${index}`} className="rf-friend">
                      <span className={`rf-friend__avatar rf-friend__avatar--${hueOf(friend.firstName)}`} aria-hidden="true">
                        {friend.firstName.slice(0, 1)}
                      </span>
                      <span className="rf-friend__name">{friend.firstName}</span>
                      <span className="rf-friend__date">{DAY.format(new Date(friend.joinedAt))}</span>
                      <span className={`rf-chip rf-chip--${friend.status}`}>
                        <Icon className="size-4" aria-hidden="true" />
                        {c.friendStatus[friend.status]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid gap-6">
          <section className="rf-card" aria-labelledby="rf-steps-title">
            <h2 id="rf-steps-title" className="rf-section-title">
              <Gift className="size-5 text-[var(--viz-4)]" aria-hidden="true" />
              {c.stepsTitle}
            </h2>
            <ol className="rf-steps">
              {c.steps.map((step, index) => (
                <li key={step} className={`rf-step rf-step--${index + 1}`}>
                  <span className="rf-step__n" aria-hidden="true">
                    {(index + 1).toLocaleString('ar-EG-u-nu-latn')}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="rf-rules">{formatCopy(c.rules, { days: data.windowDays.toLocaleString('ar-EG-u-nu-latn') })}</p>
            <Link href="/wallet" className="rf-btn rf-btn--wallet">
              <Wallet className="size-5" aria-hidden="true" />
              {c.walletCta}
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
