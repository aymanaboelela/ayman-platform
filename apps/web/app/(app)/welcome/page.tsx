import { redirect } from 'next/navigation';
import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { WhatsappChannelCard } from '@/components/dashboard/whatsapp-channel-card';
import { safeNext } from '@/lib/safe-next';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { privateRouteMetadata } from '@/lib/seo/metadata';

export const metadata = privateRouteMetadata;

/**
 * «أهلاً بيك» — the one screen between finishing onboarding and the product.
 *
 * ## Why this exists at all
 *
 * The channel is how this platform reaches a student who is NOT on it: a
 * lesson went up, an exam moved. `<WhatsappChannelCard>` already sits at the
 * top of the dashboard, and «رسايل م. أيمن» chases anyone who has not joined
 * every few weeks — but both of those are asking someone mid-task to break off
 * and do something else. The minute after signing up is the only moment the
 * student has nothing else in hand, and it is the cheapest possible moment to
 * ask.
 *
 * ## Why not simply redirect to WhatsApp
 *
 * Because it does not work, and it fails in the two worst ways at once. A
 * programmatic navigation to an external app is blocked by most browsers
 * unless it is a direct result of a press; when it does succeed it leaves the
 * student's browser sitting on WhatsApp with the platform closed behind them.
 * A press they chose is also the only press worth recording — `whatsappOpenedAt`
 * is supposed to mean "this student joined", and stamping it for a redirect
 * they were pushed into would tell `inviteCandidates` a lie it can never
 * unlearn.
 *
 * ## Why it can be walked past
 *
 * «ادخل على المنصة» is a real button, not a formality. A gate here would be a
 * second onboarding step disguised as a greeting, and the channel is worth
 * offering, not worth blocking the product behind.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next) ?? '/dashboard';

  const settings = await getPublicSettingsOrDefaults();
  const channel = settings.contact.whatsappChannel;

  /**
   * No channel configured means this page has nothing to say. `contact.whatsappChannel`
   * is admin-editable and starts `null`, and a greeting screen whose only
   * content is a button that says "continue" is worse than not showing it —
   * it reads as a step that failed to load. Straight through to where they
   * were going.
   */
  if (!channel) redirect(destination);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12 sm:py-16">
      <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{copy.welcome.title}</h1>
      <p className="mt-2 text-[length:var(--fs-text-base)] leading-relaxed text-fg-muted">
        {copy.welcome.body}
      </p>

      {/*
        The same card as the dashboard's, deliberately — a student who walks
        past it here meets an object they already recognise when they land on
        the home screen, rather than a second, differently-shaped ask. It also
        means the press is recorded through the one path that already exists
        (`WhatsappChannelLink` → `recordWhatsappOpened`), so joining from here
        stops the outreach invite exactly as joining from the dashboard does.
      */}
      <div className="mt-8">
        <WhatsappChannelCard href={channel} />
      </div>

      {/*
        A real `<Link>` wearing a button's clothes rather than a `<Button>` —
        this NAVIGATES, and a `<button>` that navigates loses middle-click,
        open-in-new-tab and the status-bar preview. `@ayman/ui`'s Button has no
        `asChild`, so the classes are spelled out; they mirror
        `VARIANTS.secondary` + `SIZES.md` in
        `packages/ui/src/components/button.tsx`.

        SECONDARY, not ghost. Ghost is transparent with muted text, and on a
        page this sparse it stopped looking pressable at all — it read as a
        caption under the card, which is a bad thing for the only control that
        continues the journey. A surface fill and a border say "button"; the
        green card above still owns the emphasis, so nothing competes with it.
      */}
      <Link
        href={destination}
        className="mt-6 flex h-10 w-full items-center justify-center rounded-sm border border-line bg-surface-3 px-4 text-[length:var(--fs-text-base)] text-fg transition-colors hover:bg-surface-4"
      >
        {copy.welcome.continue}
      </Link>
    </main>
  );
}
