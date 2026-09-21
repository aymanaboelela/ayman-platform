import Image from 'next/image';
import { mediaUrl } from '@ayman/ui/branding';
import { copy } from '@ayman/contracts/copy';
import { tenantName } from '@/lib/tenant';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getBranding } from '@/lib/settings';
import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

/**
 * The `instructor` block on «اللوح» — the one block whose classic component
 * could not be reused at all, and the one that most needed a decision rather
 * than a silent drop.
 *
 * ## What `<InstructorProfile>` is, and why none of it comes over
 *
 * It is the instructor rendered as a SOCIAL PROFILE: a round avatar
 * (`<MediaSlot kind="portrait">`, which resolves Ayman's studio photograph),
 * a tier chip, a borrowed follower-row of counts, and a tabbed grid of his
 * courses underneath. Two parts of that cannot travel:
 *
 * · the photograph — `lib/brand-assets.ts` is his registry and every entry is
 *   gated by `aymanOnly()`, so another stack gets his page's stand-in art
 *   rather than a picture of its own instructor;
 * · `DEMO_COURSES` — that component deliberately falls back to invented
 *   courses on an empty catalogue, so a fresh checkout can SEE the page it is
 *   going to have. On a live tenant's public landing page that is a grid of
 *   courses nobody can buy, presented as the catalogue. It is right for
 *   `classic` (his catalogue is full, so the fallback only ever shows locally)
 *   and wrong the moment the platform is somebody's first week.
 *
 * ## The photograph came back, from a DIFFERENT field
 *
 * ⚠️ The bullet above is still true and must stay true: nothing in
 * `lib/brand-assets.ts` is reachable from this directory, and
 * `board-landing.test.tsx` enforces that by scanning the source. What it was
 * never about is `branding.portraitAssetId` — a file THIS deployment's admin
 * uploaded to their own media library, resolved to a storage key by the API,
 * and the exact same class of thing as the `logoDarkAssetId` `<BoardMark>` has
 * been drawing on the opener panel since the preset shipped. The two were
 * conflated because the classic section reaches its portrait through the
 * registry, so "no portrait here" read as a rule about portraits when it was a
 * rule about HIS portrait.
 *
 * It goes in THIS band and not in `about`. The decision written into
 * `board-about.tsx` — that every pixel of that section is a word the tenant
 * typed into /admin/home — is still correct and is not weakened here: a
 * biography block that silently grows a photograph is a block whose output no
 * longer matches its form. This band is the opposite: its whole job is to
 * answer who is teaching, it already prints a name and three figures that
 * nobody typed, and a face is the most literal answer it can give.
 *
 * ## So it is rebuilt as an identity band, and it stays REAL
 *
 * The name comes from `tenantName()` — the single gate in `lib/tenant.ts` that
 * hands back Ayman's name on his stack and `TENANT_DISPLAY_NAME` (or the
 * anonymous «المنصة») everywhere else. Nothing biographical is invented: there
 * is no field on this platform holding an instructor's degree, employer or
 * years of experience, so this section states none. An admin who wants a
 * biography has the `about` block, which has fields for one.
 *
 * The three figures are the catalogue's own arithmetic — course count, lesson
 * count, total hours — so they cannot drift from what the grids on this page
 * show. `<InstructorProfile>` makes the same argument for its course count and
 * then takes students and hours from the copy table because nothing measures
 * them; this section simply does not print a figure nothing measures.
 *
 * ## The empty catalogue prints a sentence, not «٠ كورس»
 *
 * A row of three zeroes is the single most discouraging thing a first visitor
 * could read, and it is also just noise — the counts are only worth printing
 * once there is something to count. A brand-new stack gets one honest line
 * instead. Nothing here returns `null`: the admin placed this block to say who
 * is teaching, and that answer exists on day one even when the catalogue does
 * not.
 */
export async function BoardInstructor({ level }: { level: 1 | 2 }) {
  /* `getBranding()` هنا وكمان في `<BoardLanding>`، وده مجاني: لودر
     `'use cache'` متعلّم بـ`tags.settings('branding')`، فالنداءين رن واحد.
     الوصول للبراندنج من جوّه القسم أنضف من تمريره في `renderBoardBlock`،
     لأن التست بيرندر القسم ده لوحده. */
  const [{ courses }, branding] = await Promise.all([getCatalogOrEmpty(), getBranding()]);

  const lessons = courses.reduce((sum, course) => sum + course.lessonCount, 0);
  const hours = Math.round(courses.reduce((sum, course) => sum + course.totalSeconds, 0) / 3600);

  /*
   * ONE condition for all three figures, not three.
   *
   * A catalogue can legitimately hold a course with zero published lectures —
   * `CourseService.setStatus` only requires one published lesson of ANY kind,
   * which a lone exam quiz satisfies — so «3 كورس · 0 محاضرة · 0 ساعة» is a
   * reachable state, and it reads far worse than the sentence does. The row
   * appears when there is a catalogue at all; the figures inside it are then
   * whatever they honestly are.
   */
  const hasCatalogue = courses.length > 0;

  return (
    <section className="board-band" id="instructor">
      <div className="board-shell">
        <BoardHeading
          chip={boardCopy.instructor.chip}
          title={boardCopy.instructor.title}
          level={level}
        />

        <div className="board-id">
          {branding.portraitKey ? (
            /*
              ١٩٢×٢٥٦ — ٣:٤، نفس نسبة الملفات المرفوعة فعلًا (٩١٢×١٢١٦ و
              ٩١٤×١٢٠٠)، فمفيش قصّ. دايرة كانت هتقصّ ٣:٤ لمربع من النص، واللي
              في النص في بورتريه واقف مش الوش بالضرورة — فصندوق واقف بنفس نسبة
              الملف هو الاختيار اللي مابيراهنش على تكوين صورة محدش شافها.

              فوق الاسم عشان `.board-id` عمود في النص: «اللوح» كله متمركز،
              وصورة جنب النص هنا كانت هتبقى تكوين من بريست تاني.

              `alt=""`: الاسم مكتوب تحتيها مباشرة في `.board-id__name`.
            */
            <span className="board-id__portrait">
              <Image
                src={mediaUrl(branding.portraitKey)}
                alt=""
                width={192}
                height={256}
                sizes="192px"
              />
            </span>
          ) : null}

          {/* `copy.site.instructor` is the FALLBACK argument, never the value:
              `tenantName()` returns it only on the stack whose `TENANT_KEY` is
              `ayman`. Reading `copy.site.instructor` directly here is precisely
              the leak `lib/tenant.ts` exists to make impossible. */}
          <p className="board-id__name">{tenantName(copy.site.instructor)}</p>

          {hasCatalogue ? (
            <dl className="board-id__figures">
              <div className="board-id__figure">
                <dt className="board-id__n tabular-nums">{courses.length}</dt>
                <dd className="board-id__l">{boardCopy.instructor.coursesUnit}</dd>
              </div>
              <div className="board-id__figure">
                <dt className="board-id__n tabular-nums">{lessons}</dt>
                <dd className="board-id__l">{boardCopy.instructor.lessonsUnit}</dd>
              </div>
              <div className="board-id__figure">
                <dt className="board-id__n tabular-nums">{hours}</dt>
                <dd className="board-id__l">{boardCopy.instructor.hoursUnit}</dd>
              </div>
            </dl>
          ) : (
            <p className="board-id__starting">{boardCopy.instructor.starting}</p>
          )}
        </div>
      </div>
    </section>
  );
}
