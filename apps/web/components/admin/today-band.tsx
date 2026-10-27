import Link from 'next/link';
import { Clapperboard, MessageCircle, ReceiptText, Smartphone, Wallet, type LucideIcon } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { AdminMobileTodaySchema, type AdminMobileToday } from '@ayman/contracts/admin/mobile';
import { adminGet } from '@/lib/admin-api';

const c = copy.admin.today;

/** Never throws: the band is a summary on a page whose own job is elsewhere. */
async function loadToday(): Promise<AdminMobileToday | null> {
  try {
    return await adminGet('/api/admin/mobile/today', AdminMobileTodaySchema);
  } catch {
    return null;
  }
}

/**
 * «النهارده» — the night push and the two ops alerts, as a standing band at
 * the top of `/admin` (`adminMobile`).
 *
 * The pushes say each thing once; this says it for as long as it is true, so
 * a missed notification is never the only record that WhatsApp is unlinked
 * or a lecture failed to upload. Unlike `OverviewQueues` it is always drawn:
 * «الواتساب شغال» and «مفيش فيديو فشل» are answers worth seeing at a glance,
 * and green next to red is what makes the red read as news.
 *
 * Each tile appears only when the API sent its part — a part is `null` for a
 * caller without that screen's permission, or a stack without that thing.
 */
export async function TodayBand() {
  const today = await loadToday();
  if (!today) return null;
  const { sales, whatsapp, failedVideos } = today;
  if (!sales && !whatsapp && !failedVideos) return null;

  const waUp = whatsapp === 'connected';
  const waLabel = waUp ? c.whatsappUp : whatsapp === 'unreachable' ? c.whatsappUnreachable : c.whatsappDown;
  const failed = failedVideos?.count ?? 0;

  return (
    <section className="mb-6" aria-labelledby="today-band-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="today-band-title" className="text-[length:var(--fs-title-4)] font-medium text-fg">
          {c.title}
        </h2>
        {sales ? (
          <Link
            href="/admin/review"
            className="inline-flex items-center gap-2 rounded-[var(--r-md)] bg-accent px-3 py-2 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
          >
            <Smartphone className="size-4 shrink-0" aria-hidden="true" />
            {c.review}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sales ? (
          <>
            <TodayTile
              href="/admin/analytics/money"
              icon={ReceiptText}
              hue="students"
              value={sales.count}
              label={c.subs}
              hint={formatCopy(c.subsSplit, { fresh: sales.newCount, renewal: sales.renewalCount })}
            />
            <TodayTile
              href="/admin/analytics/money"
              icon={Wallet}
              hue="money"
              value={formatCopy(c.netValue, { amount: Math.round(sales.netCents / 100).toLocaleString('en-US') })}
              label={c.net}
              hint={c.netHint}
            />
          </>
        ) : null}
        {whatsapp ? (
          <TodayTile
            href="/admin/marketing/device"
            icon={MessageCircle}
            tone={waUp ? 'ok' : 'err'}
            value={waLabel}
            label={c.whatsapp}
            hint={waUp ? c.whatsappUpHint : c.whatsappDownHint}
          />
        ) : null}
        {failedVideos ? (
          <TodayTile
            href="/admin/videos"
            icon={Clapperboard}
            tone={failed > 0 ? 'err' : 'ok'}
            value={failed > 0 ? formatCopy(c.videosFailed, { n: failed }) : c.videosOk}
            label={c.videos}
            hint={
              failed > 0 && failedVideos.lessons[0]
                ? formatCopy(c.videosFailedHint, { lesson: failedVideos.lessons[0].title })
                : c.videosOkHint
            }
          />
        ) : null}
      </div>
    </section>
  );
}

function TodayTile({
  href,
  icon: Icon,
  value,
  label,
  hint,
  hue,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  value: string | number;
  label: string;
  hint: string;
  /** A sidebar group hue, for the figures. */
  hue?: string;
  /** Green or red, for the two health tiles — a state, not a figure. */
  tone?: 'ok' | 'err';
}) {
  return (
    <Link
      href={href}
      className={`panel stat-tile min-w-0${hue ? ' admin-hued' : ''}${tone ? ` stat-tile--${tone}` : ''}`}
      data-hue={hue}
    >
      <span className="stat-tile__well" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="stat-tile__value block">{value}</span>
        <span className="stat-tile__label block">{label}</span>
        <span className="stat-tile__hint block truncate">{hint}</span>
      </span>
    </Link>
  );
}
