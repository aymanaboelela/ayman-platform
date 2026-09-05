import { redirect } from 'next/navigation';
import { Check } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { WhatsappChannelCard } from '@/components/dashboard/whatsapp-channel-card';
import { WelcomeScene } from '@/components/welcome/welcome-scene';
import { firstName } from '@/lib/dashboard-view';
import { safeNext } from '@/lib/safe-next';
import { getSession } from '@/lib/session';
import { getWhatsappChannelFresh } from '@/lib/settings';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import { WELCOME_ENTRANCE_MS, entranceDelay, stepDelayMs } from '@/lib/welcome-motion';

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
 *
 * ## The screen MOVES now, and why that is the same argument continued
 *
 * The band and the rail fixed what the screen was MADE of. They did not fix
 * what it DID, which was nothing: «دي عاوز يبقى شكلها حلو كده، ترحب بيه
 * بأنيميشن أو صور من النت، ويضغط ابدأ الآن تبقى قدامه بتتحرك كده يعني». A
 * 380px card marooned at the top of a 1129px page, nothing acknowledging the
 * form the student had just finished, and a link that navigated in the same
 * frame it was pressed. It read as a receipt, not as an arrival.
 *
 * Four answers, and one thing deliberately not done:
 *
 *   · **It assembles.** Eyebrow, greeting, sub-line, the three stops and the
 *     card arrive on a 60ms ladder, and the two finished stops visibly TICK —
 *     the mark pops and the check DRAWS itself. That is the moment worth
 *     animating, because it is the only moment on this screen that is about
 *     the student rather than about us: it is the work they just did being
 *     counted in front of them. The whole sequence is over inside 800ms
 *     (`welcome-motion.ts` owns the ladder and the test that keeps it under a
 *     second).
 *   · **The band is alive.** `.stage--welcome` gets an aura behind the words:
 *     deep ember pools that drift, and one warm bloom that breathes. Built
 *     from `--e-*`, capped so the measured contrast on the band never drops —
 *     the arithmetic is in `study.css` and it is not decorative prose, the
 *     worst case is 4.91:1 against a 4.5:1 requirement.
 *   · **The press is a departure.** `<WelcomeScene>` holds a plain left-click
 *     for 260ms: the third stop ticks, the scene lifts away, and THEN the
 *     router moves. Middle-click, ⌘-click and open-in-new-tab are untouched,
 *     which is exactly why this is still a `<Link>` and not a `<button>`.
 *   · **The page is not empty.** The scene is centred in the viewport rather
 *     than pinned to the top of it, widened by four rem, and sat on a soft
 *     ember floor-glow — the same idiom `.app-bloom` already lights every
 *     signed-in screen with, anchored at the other end. On a 390px phone the
 *     glow is the whole background and the centring is a no-op, which is the
 *     right behaviour on the device most students see this on.
 *
 * And what was NOT done: «صور من النت». Stock photography was tried on this
 * product's cards and lost every time — English burned into the artwork, a
 * crop that fails at wide aspect ratios, and a look that fights the bespoke
 * course covers the platform already draws. Motion built from the palette
 * costs no request on a first-paint screen, re-themes with light and dark, and
 * cannot arrive broken.
 *
 * ⚠️ Every animation on this screen is disabled under `prefers-reduced-motion:
 * reduce`, and the CTA never fades: it is painted and pressable on the first
 * frame regardless. See `.welcome-cta` in study.css.
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
    /*
      `<WelcomeScene>` owns the `<main>` and the CTA; everything between these
      tags is still a Server Component and its markup never reaches the client
      bundle. See that file for why the split falls exactly here.
    */
    <WelcomeScene href={destination} cta={c.continue}>
      <section className="stage stage--welcome">
        {/*
          The band's aura — two drifting pools of deep ember and one warm bloom
          that breathes, behind the words. A real element rather than a third
          pseudo on `.stage` because `.stage` has already spent both of its own:
          `::before` is the dot field every band carries and `::after` is the
          hairline that keeps it off a dark page. Scoping it to this one
          instance is also the point — a course band that pulsed behind its
          title every day of the year would be the opposite of what a band is
          for.
        */}
        <div className="welcome-aura" aria-hidden="true" />
        <div className="stage__body">
          <p className="stage__eyebrow welcome-in" style={entranceDelay(WELCOME_ENTRANCE_MS.eyebrow)}>
            {c.eyebrow}
          </p>
          <h1 className="stage__title welcome-in" style={entranceDelay(WELCOME_ENTRANCE_MS.title)}>
            {name ? c.titleNamed.replace('{name}', name) : c.title}
          </h1>
          <p className="stage__sub welcome-in" style={entranceDelay(WELCOME_ENTRANCE_MS.body)}>
            {c.body}
          </p>

          {/* Two done, one to go. `<ol>` because it is genuinely ordered and a
              screen reader should say so; every mark is `aria-hidden`, so NONE
              of them is announced and the state is carried entirely by the list
              order and the words — past tense for the first two, «نبدأ» for the
              third. Nothing depends on seeing a tick, which is also why the
              animation costs nothing in accessibility terms: a student who never
              sees a single frame of it reads the same three labels in the same
              order. (This used to say the open stop was distinguished by having
              no tick in the DOM. It has one now — invisible until the press
              completes it — and that changed nothing here, because the marks
              were never the accessible signal.) */}
          <ol className="welcome-steps" aria-label={c.stepsLabel}>
            <Step label={c.stepAccount} index={0} done />
            <Step label={c.stepProfile} index={1} done />
            <Step label={c.stepStart} index={2} />
          </ol>
        </div>
      </section>

      {/*
        The one ask. `flush` drops the card's own `mb-6`: it carries that
        margin for the dashboard, where a stack of blocks follows it, and here
        it stacked with this wrapper's spacing into a 48px gap between the card
        and the button that follows it — the two things on the page that belong
        together, held furthest apart.

        The wrapper carries the entrance rather than the card, because the card
        is shared with the dashboard and has no business knowing that one of
        its three callers animates.
      */}
      <div className="welcome-in mt-6" style={entranceDelay(WELCOME_ENTRANCE_MS.card)}>
        <WhatsappChannelCard href={channel} flush />
      </div>
    </WelcomeScene>
  );
}

/**
 * One stop on the rail.
 *
 * `done` draws the tick; the open one draws a ring. The `<Check>` is rendered
 * on ALL three — on the open stop it is invisible (`study.css` zeroes it), and
 * it is in the DOM for one reason: pressing «يلا نبدأ» completes that third
 * stop on the way out. A check that has to appear at the moment of the press
 * cannot be mounted at the moment of the press, because a path cannot draw
 * itself in the same frame it is inserted. The ring stays «deliberately empty»
 * exactly as long as it was before; nothing is announced, since the whole mark
 * is `aria-hidden`.
 *
 * `index` places the stop on the entrance ladder. It is passed rather than
 * derived from the children's position because the caller is the only thing
 * that knows the order, and `stepDelayMs` is the only thing that knows the
 * stride.
 */
function Step({ label, index, done = false }: { label: string; index: number; done?: boolean }) {
  return (
    <li
      className={
        done
          ? 'welcome-steps__step welcome-steps__step--done welcome-in'
          : 'welcome-steps__step welcome-in'
      }
      style={entranceDelay(stepDelayMs(index))}
    >
      <span className="welcome-steps__mark" aria-hidden="true">
        <Check className="size-3" />
      </span>
      {label}
    </li>
  );
}
