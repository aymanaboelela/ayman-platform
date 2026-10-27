import Link from 'next/link';
import {
  BadgeCheck,
  CheckCheck,
  Clock,
  CreditCard,
  MessageCircle,
  Send,
  Smartphone,
  Sparkles,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { adminAutoOutreach as c } from '@ayman/contracts/copy/admin-auto-outreach';
import { formatCopy } from '@ayman/contracts/format';
import type { AutoKindStats, AutoOutreachOverview } from '@ayman/contracts/outreach/auto';
import { cn } from '@ayman/ui/lib/cn';
import { formatEGP } from '@/lib/price';

/**
 * «رسايل الواتساب التلقائية» — the card on `/admin/outreach` for the two
 * messages that leave the linked number with nobody pressing anything.
 *
 * ## The order is the design
 *
 * Is it running → what did it earn → what does it say. The status band comes
 * first because the one state that silently costs money is «مش مربوط»: every
 * reminder waits, nothing is lost, and nothing goes out either — so it is said
 * in colour, with the button that fixes it, before any number.
 *
 * Two kind cards in two colours (amber for «كمّل الدفع», violet for «الحساب
 * جاهز»), each a row of chips ending in the two numbers that matter: who paid
 * after it, and how much. The owner judges this screen the way a parent
 * judges the student one (memory `ayman-ui-taste`): objects, colour, an icon
 * on everything.
 */
export function AutoOutreachCard({ overview }: { overview: AutoOutreachOverview }) {
  const connected = overview.device === 'connected';

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-accent/30 bg-surface-2">
      <header className="flex flex-wrap items-start gap-4 border-b border-accent/20 bg-accent/10 px-5 py-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-[#1A1206]">
          <MessageCircle className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">{c.eyebrow}</p>
          <h2 className="mt-0.5 text-[length:var(--fs-title-3)] font-semibold text-fg">{c.title}</h2>
          <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
            {c.lead}
          </p>
        </div>
      </header>

      {/* ── status band ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-4">
        <Chip
          icon={Smartphone}
          tone={connected ? 'ok' : 'err'}
          label={`${c.deviceLabel}: ${c.device[overview.device]}`}
        />
        <Chip
          icon={Clock}
          tone={overview.inWindow ? 'info' : 'muted'}
          label={overview.inWindow ? c.windowOpen : c.windowClosed}
        />
        <Chip
          icon={Send}
          tone={overview.sentToday >= overview.dailyCap ? 'warn' : 'accent'}
          label={formatCopy(c.todayLine, { n: overview.sentToday, cap: overview.dailyCap })}
          title={c.todayHint}
        />
        <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(c.dueNowLine, {
            checkout: overview.dueNow.checkout,
            signup: overview.dueNow.signup,
          })}
        </span>
      </div>

      {!connected ? (
        <div className="mx-5 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-err/30 bg-err/8 px-4 py-3">
          <p className="min-w-0 flex-1 text-[length:var(--fs-text-sm)] leading-[1.7] text-fg">{c.devicePaused}</p>
          <Link
            href="/admin/marketing"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] hover:bg-accent-hover"
          >
            <Smartphone className="size-4" aria-hidden="true" />
            {c.linkDevice}
          </Link>
        </div>
      ) : null}

      {/* ── the two kinds ───────────────────────────────────────────── */}
      <div className="grid gap-4 px-5 pb-5 lg:grid-cols-2">
        <KindCard
          tone="accent"
          icon={CreditCard}
          title={c.checkoutTitle}
          lead={c.checkoutLead}
          candidatesLabel={c.checkoutCandidates}
          convertedLabel={c.checkoutConverted}
          stats={overview.checkout}
        />
        <KindCard
          tone="study"
          icon={UserPlus}
          title={c.signupTitle}
          lead={c.signupLead}
          candidatesLabel={c.signupCandidates}
          convertedLabel={c.signupConverted}
          stats={overview.signup}
        />
      </div>

      {/* ── what it says ────────────────────────────────────────────── */}
      <div className="border-t border-line-subtle px-5 py-5">
        <h3 className="flex items-center gap-2 text-[length:var(--fs-title-4)] font-semibold text-fg">
          <Sparkles className="size-4 text-accent-text" aria-hidden="true" />
          {c.previewTitle}
        </h3>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.previewLead}</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {overview.samples.map((sample, index) => (
            <article
              // A fixed-length rendering of a pure function — never reordered.
              key={`${sample.kind}-${index}`}
              className={cn(
                'rounded-xl border p-4',
                sample.kind === 'checkout_recovery'
                  ? 'border-accent/30 bg-accent/5'
                  : 'border-study/30 bg-study/5',
              )}
            >
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                <MessageCircle className="size-3" aria-hidden="true" />
                {SAMPLE_LABELS[index] ?? ''}
              </p>
              {/* `pre-wrap` + `wrap-anywhere`: see `MessageBody` in page.tsx. */}
              <p className="whitespace-pre-wrap wrap-anywhere text-[length:var(--fs-text-sm)] leading-[1.8] text-fg">
                {sample.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** In the order `AutoOutreachOverviewService.samples` composes them. */
const SAMPLE_LABELS = [c.sampleCheckoutCourse, c.sampleCheckoutBook, c.sampleSignup1, c.sampleSignup2];

type Tone = 'accent' | 'study' | 'ok' | 'err' | 'warn' | 'info' | 'muted';

const CHIP_TONES: Record<Tone, string> = {
  accent: 'border-accent/40 bg-accent/12 text-accent-text',
  study: 'border-study/40 bg-study/12 text-fg',
  ok: 'border-ok/40 bg-ok/12 text-ok',
  err: 'border-err/40 bg-err/10 text-err',
  warn: 'border-warn/40 bg-warn/12 text-warn',
  info: 'border-info/40 bg-info/10 text-info',
  muted: 'border-line bg-surface-3 text-fg-muted',
};

function Chip({
  icon: Icon,
  tone,
  label,
  title,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[length:var(--fs-text-sm)] font-medium',
        CHIP_TONES[tone],
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </span>
  );
}

function KindCard({
  tone,
  icon: Icon,
  title,
  lead,
  candidatesLabel,
  convertedLabel,
  stats,
}: {
  tone: 'accent' | 'study';
  icon: LucideIcon;
  title: string;
  lead: string;
  candidatesLabel: string;
  convertedLabel: string;
  stats: AutoKindStats;
}) {
  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border p-4',
        tone === 'accent' ? 'border-accent/35 bg-accent/6' : 'border-study/35 bg-study/6',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg',
            tone === 'accent' ? 'bg-accent/20 text-accent-text' : 'bg-study/20 text-fg',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{title}</h3>
          <p className="mt-0.5 text-[length:var(--fs-text-xs)] leading-[1.7] text-fg-muted">{lead}</p>
        </div>
        <span className="ms-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-faint">
          {c.statWindow}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure icon={UserPlus} label={candidatesLabel} value={stats.candidates} />
        <Figure icon={Send} label={c.statSent} value={stats.sent} />
        <Figure icon={MessageCircle} label={c.statWhatsapp} value={stats.sentWhatsapp} />
        <Figure icon={CheckCheck} label={c.statDelivered} value={stats.delivered} />
      </dl>

      <dl className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-ok/35 bg-ok/10 p-3">
          <dt className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            <BadgeCheck className="size-3.5 text-ok" aria-hidden="true" />
            {convertedLabel}
          </dt>
          <dd className="mono mt-1 text-[length:var(--fs-title-3)] font-semibold text-ok">{stats.converted}</dd>
        </div>
        <div className="rounded-lg border border-ok/35 bg-ok/10 p-3">
          <dt className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            <Wallet className="size-3.5 text-ok" aria-hidden="true" />
            {c.statRevenue}
          </dt>
          <dd className="mono mt-1 text-[length:var(--fs-title-3)] font-semibold text-ok">
            {formatEGP(stats.revenueCents)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function Figure({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-1 p-2.5">
      <dt className="flex items-center gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
        <Icon className="size-3.5" aria-hidden="true" />
        <span className="min-w-0 truncate">{label}</span>
      </dt>
      <dd className="mono mt-0.5 text-[length:var(--fs-title-4)] font-semibold text-fg">{value}</dd>
    </div>
  );
}
