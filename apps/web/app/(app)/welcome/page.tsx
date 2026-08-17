import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { WhatsappChannelCard } from '@/components/dashboard/whatsapp-channel-card';
import { firstName } from '@/lib/dashboard-view';
import { safeNext } from '@/lib/safe-next';
import { getSession } from '@/lib/session';
import { getWhatsappChannelFresh } from '@/lib/settings';
import { privateRouteMetadata } from '@/lib/seo/metadata';

export const metadata = privateRouteMetadata;

const c = copy.welcome;

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
 * «يلا نبدأ» is a real button, not a formality. A gate here would be a
 * second onboarding step disguised as a greeting, and the channel is worth
 * offering, not worth blocking the product behind.
 *
 * ## The shape, and the complaint it answers
 *
 * This was a bare `<h1>`, a grey paragraph, the green card, and a grey link —
 * four elements on the page background with nothing holding them, and a 48px
 * hole in the middle of them. It is the LAST screen of signing up and the
 * first screen of the product, and it read as neither: «عايز UX شكلها حلو،
 * background حلوة… ويلا بينا نبدأ دي يبقى شكلها حلو».
 *
 * Three changes, all of them things the product already owns:
 *
 *   · The greeting moves onto `.stage`, the ember band a course or an exam
 *     introduces itself on. It is the platform's answer to "this is a place",
 *     it is already contrast-tuned against its own gradient, and it costs one
 *     class.
 *   · It says the student's NAME. The dashboard one press away already does;
 *     greeting them as nobody and then handing them to a page that knows them
 *     is two products across one navigation.
 *   · A three-stop rail under the title — two ticks and one open stop. It is
 *     «حسابك جاهز، فاضل حاجة واحدة» drawn instead of written, and it is the
 *     only thing on the screen that answers "how much more of this is there".
 *
 * And «يلا نبدأ» is amber now. The rule this surface runs on is that amber is
 * what you press; the button that continues the journey was `bg-surface-3`
 * grey, on a screen with no resume card to defer to, so nothing on it wore the
 * action colour at all. The green card is untouched — green means "this leaves
 * the platform" and it is still the one ask.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, channel, session] = await Promise.all([
    searchParams,
    /**
     * Read FRESH, not through the cached settings reader — see
     * `getWhatsappChannelFresh`. Whether this screen exists at all hangs on this
     * one value, and `next build` (which runs with no API reachable) bakes an
     * empty one into the cache, so the cached read made the greeting vanish for
     * the first minutes after every deploy.
     */
    getWhatsappChannelFresh(),
    /*
     * For the name, and for nothing else. `getSession()` is `cache()`-wrapped
     * and the shell above this page has already asked for it, so this costs no
     * round trip — which is the entire reason the greeting reads the session
     * rather than fetching `/api/profile/me` for the name the wizard just
     * saved. The two can differ only if the student edited their name during
     * onboarding, and both are names they gave us minutes ago.
     */
    getSession(),
  ]);

  const destination = safeNext(next) ?? '/dashboard';

  /**
   * No channel configured means this page has nothing to say. `contact.whatsappChannel`
   * is admin-editable and starts `null`, and a greeting screen whose only
   * content is a button that says "continue" is worse than not showing it —
   * it reads as a step that failed to load. Straight through to where they
   * were going.
   */
  if (!channel) redirect(destination);

  const name = firstName(session?.name);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-14">
      <section className="stage">
        <div className="stage__body">
          <p className="stage__eyebrow">{c.eyebrow}</p>
          <h1 className="stage__title">
            {name ? c.titleNamed.replace('{name}', name) : c.title}
          </h1>
          <p className="stage__sub">{c.body}</p>

          {/* Two done, one to go. `<ol>` because it is genuinely ordered and a
              screen reader should say so; the ticks are `aria-hidden` and the
              state is carried by the list order plus `welcome-steps__step--now`
              having no tick to announce — the words themselves are past tense
              for the first two and «نبدأ» for the third, so nothing depends on
              seeing the marks. */}
          <ol className="welcome-steps" aria-label={c.stepsLabel}>
            <Step label={c.stepAccount} done />
            <Step label={c.stepProfile} done />
            <Step label={c.stepStart} />
          </ol>
        </div>
      </section>

      {/*
        The one ask. `flush` drops the card's own `mb-6`: it carries that
        margin for the dashboard, where a stack of blocks follows it, and here
        it stacked with this wrapper's spacing into a 48px gap between the card
        and the button that follows it — the two things on the page that belong
        together, held furthest apart.
      */}
      <div className="mt-6">
        <WhatsappChannelCard href={channel} flush />
      </div>

      {/*
        A real `<Link>` wearing a button's clothes rather than a `<Button>` —
        this NAVIGATES, and a `<button>` that navigates loses middle-click,
        open-in-new-tab and the status-bar preview.

        Amber, which it was not. It was a hand-copy of `VARIANTS.secondary` in
        `bg-surface-3` grey, and the comment justifying that argued from the
        dashboard's rule that only one surface on a page may be accent-tinted.
        That rule is about a page with a resume card on it. THIS page has no
        other action at all, so the rule left it with none — the one screen
        whose entire job is to continue the journey, and nothing on it wearing
        the colour this product uses to mean "press here".

        `.welcome-cta` and not `.chip .chip--solid`: the chip is `block-size:
        2rem` and `flex-shrink: 0`, sized for the end of a lesson row, and
        study.css is loaded after the Tailwind layer — so `h-11 w-full` on it
        would have been silently overruled by the chip's own height. Same amber,
        a box built for a page's primary control. (See the ⚠️ at the top of
        study.css about utility-name collisions; this is the same trap.)
      */}
      <Link href={destination} className="welcome-cta">
        {c.continue}
        <ArrowLeft className="size-4" aria-hidden="true" />
      </Link>
    </main>
  );
}

/** One stop on the rail. `done` draws the tick; the open one draws a ring. */
function Step({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <li className={done ? 'welcome-steps__step welcome-steps__step--done' : 'welcome-steps__step'}>
      <span className="welcome-steps__mark" aria-hidden="true">
        {done ? <Check className="size-3" /> : null}
      </span>
      {label}
    </li>
  );
}
