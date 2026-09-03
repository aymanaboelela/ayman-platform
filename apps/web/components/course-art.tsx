import Image from 'next/image';
import {
  Atom,
  BarChart3,
  BookOpen,
  Braces,
  Brain,
  Briefcase,
  Calculator,
  FlaskConical,
  Globe2,
  HeartPulse,
  Landmark,
  Languages,
  Leaf,
  Microscope,
  Moon,
  PenLine,
  Sigma,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { mediaUrl } from '@ayman/ui/branding';
import { artVariant, subjectArt, type SubjectGlyph } from '@/lib/subject-art';

const GLYPHS: Record<SubjectGlyph, LucideIcon> = {
  sigma: Sigma,
  atom: Atom,
  flask: FlaskConical,
  leaf: Leaf,
  braces: Braces,
  pen: PenLine,
  languages: Languages,
  landmark: Landmark,
  globe: Globe2,
  brain: Brain,
  moon: Moon,
  microscope: Microscope,
  calculator: Calculator,
  briefcase: Briefcase,
  heart: HeartPulse,
  trending: TrendingUp,
  chart: BarChart3,
  book: BookOpen,
};

/**
 * A course's artwork: the uploaded cover when there is one, a generated scene
 * when there is not.
 *
 * ## One component, four screens
 *
 * The dashboard card, the library card, the in-shell course header and the
 * public catalog card each had their own copy of "cover, or else a grey panel".
 * They are one object — the same course has to look like the same course on all
 * four — so they are one component now. The caller owns the aspect box and this
 * fills it; nothing here assumes a ratio.
 *
 * ## What the generated scene is made of
 *
 * Three layers, in this order:
 *
 *   1. a two-stop gradient in the subject's hue (CSS, so it re-themes)
 *   2. `<svg>` shapes — discs, a ring, a rounded square, a dot field — in white
 *      and black alphas only, so ONE set of shape markup works on every hue
 *      and in both themes without a second palette
 *   3. the subject's glyph in a glass disc, and its name
 *
 * Layer 2 is drawn in alphas rather than in colours for the reason above and
 * for a second one: an alpha over the gradient is always the gradient, lighter
 * or darker. It cannot clash with the hue underneath it, which is what would
 * otherwise have to be checked eighteen times, once per subject.
 *
 * `preserveAspectRatio="xMidYMid slice"` — the shapes are a composition, not a
 * diagram, so they crop rather than squash when the box is a different ratio
 * from the 16/9 the coordinates are drawn in.
 *
 * ## Accessibility
 *
 * The whole thing is `aria-hidden`. Every call site renders the course title as
 * text beside it, and the subject name printed on the art is also in the card's
 * own metadata — a screen reader announcing either would be saying the same
 * thing twice. The uploaded-cover branch takes `alt=""` for exactly the same
 * reason, which is the position all four call sites already held.
 */
export function CourseArt({
  coverKey,
  subjectNameAr,
  seed,
  compact = false,
  sizes,
  className,
}: {
  coverKey: string | null;
  subjectNameAr: string;
  /**
   * What the shape LAYOUT is derived from — the course id or slug. Two courses
   * in one subject share a hue and must not share a composition; see
   * `artVariant`.
   */
  seed: string;
  /**
   * For boxes under ~10rem wide — the resume card's thumbnail is 8rem. At that
   * size the full scene is unreadable rather than small: a 2.75rem disc and a
   * mono label inside 16px of padding leave the shapes no room, and the subject
   * name wraps or clips. Compact drops the label and shrinks the disc, so what
   * survives is the hue and the composition, which is all a thumbnail is for.
   *
   * Not a breakpoint and not a container query: the size is a property of the
   * SLOT, not of the viewport, and the same card can hold a compact thumbnail
   * and a full-size cover on one screen.
   */
  compact?: boolean;
  /**
   * The slot's own width, when the caller knows it and the defaults below do
   * not.
   *
   * ⚠️ `compact` is a LAYOUT switch, not a size — it means "crop to my box and
   * drop the label", and its `128px` default was written for the two slots that
   * had it first (an 80px and a 128px thumbnail). The book shop's cards are
   * compact-SHAPED, because a 3/4 jacket has to crop and carries its title in
   * the card beside it, and 320px WIDE. Left on the default they were served a
   * 128px file for a 320px box and the covers went soft — reported as «الكواليتي
   * وحشة جدا وأنا رافعها فل كواليتي», and it was: the source is 1023×1537.
   *
   * So a caller whose slot is neither of the original two passes its own width
   * here. In `rem`, matching the CSS track it is measuring, because this product
   * deliberately never sets `html { font-size }` (WCAG 1.4.4) — a `px` string
   * would silently under-fetch for a reader who has enlarged their default.
   */
  sizes?: string;
  className?: string;
}) {
  if (coverKey) {
    return (
      /*
       * Through `next/image`. All four call sites this component absorbed
       * carried the same note saying it could not be, and half of that note
       * was wrong: covers ARE served from the media origin, which is
       * deliberately not the app origin (A10) — but `next.config.ts`
       * allowlists it under `pathname: '/media/**'`, which is exactly the
       * shape `mediaUrl()` builds, so the optimizer accepts them and has
       * since the allowlist entry was written. It re-serves from
       * `/_next/image` on our own origin, so nothing about the CSP changes.
       *
       * `fill` needed every caller checked, because it injects
       * `position: absolute; inset: 0` and would otherwise escape to whatever
       * ancestor happens to be positioned. All five slots own a positioned
       * aspect box: `path-map`'s `relative aspect-[4/3] w-20`, the library
       * card's `relative aspect-[16/8]`, `CourseCover`'s `relative
       * aspect-[16/10]`, the dashboard card's `relative aspect-[16/7]` and
       * `continue-watching`'s `relative aspect-video w-32`. None of them
       * depends on this element for its height, so taking it out of flow
       * collapses nothing. `.course-art__photo`'s `object-fit: cover` still
       * applies.
       *
       * ## Why `sizes` is a measurement on the phone and a bound above it
       *
       * One component, five slots, and `sizes` is per ELEMENT — so one string
       * has to be an upper bound over all five at every width.
       *
       * Below `sm` every non-compact slot is a single full-width column, so
       * `94vw` there is not an approximation, it is the width (the content
       * column is the viewport less 1.5rem of page padding on each side).
       * That band is the entire point of this change: it is where a 1600px
       * source was being paid for over mobile data to fill a ~350px box.
       *
       * Above `md` the five diverge by ~3x inside one viewport band — at
       * 1280px the library grid gives its card ~357px while `/dashboard`'s
       * `lg:grid-cols-1` gives its own ~983px — so the desktop entries are
       * bounds and over-declare by up to 2x for the narrower slots. That is
       * still strictly better than what it replaces, which served the full
       * stored source at every width; tightening it means threading a `sizes`
       * prop through all five callers, which is a change to five other files.
       *
       * `compact` is already the slot-size signal (see the prop), and its two
       * ORIGINAL call sites are 80px and 128px wide, so it takes a flat `128px`
       * rather than a share of the viewport. Without that split the 80px
       * thumbnail on the dashboard's continue-watching card — above the fold,
       * on a phone — would ask for a viewport-wide image.
       *
       * Both defaults are overridable per call site by `sizes`, which is how a
       * compact slot that is NOT a thumbnail (the book shop's 20rem cards) gets
       * a file it can actually be read at. See the prop.
       */
      /*
       * THE BOX TAKES ITS HEIGHT FROM THE PICTURE, not the other way round.
       *
       * ## Where this landed, and the two answers it went through
       *
       * `cover` came first and it CROPS, differently in every slot, because no
       * two share a ratio — 16/7 on the dashboard, 16/10 in the library and on
       * the course page, 4/3 in the path map, 16/9 on the resume thumbnail. A
       * cover is a designed poster with the course's own title written across
       * it, so that is not a neutral reframing: the one uploaded cover is
       * 1536×1024 (3:2) and the dashboard's 16/7 box cut 34% of its height,
       * taking the top off «التأسيسي» in the course's own name. Reported as
       * «الصورة متقصّة من فوق».
       *
       * `contain` was the second answer and it trades the crop for BARS — the
       * same 3:2 cover in a 16/7 box leaves a fifth of the card as filler, which
       * reads as an image that failed to load rather than as a frame, even with
       * a blurred copy of the cover behind it. Rejected as «عايز تاخد العرض كله
       * يعني يطول وعرض الصورة».
       *
       * So: no fit at all. `width: 100%`, `height: auto`, and the element's
       * height is whatever the file's own ratio makes it. Nothing is cropped,
       * nothing is padded, and a cover of ANY shape lands correctly without this
       * component ever being told what shape it is — which is the requirement,
       * because `AdminCoverCropper`'s 16/9 is applied at UPLOAD time and a cover
       * that predates it (this one) keeps its own ratio forever.
       *
       * ⚠️ `width`/`height` below are a PLACEHOLDER ratio, not a claim. Next
       * needs both for a remote image, and uses them only to reserve the box
       * before the bytes arrive; `height: auto` then hands the real intrinsic
       * ratio the final say. An on-spec 16/9 cover reserves exactly right and
       * never shifts, an off-spec one settles once on first paint. The
       * dimensions ARE stored (`MediaAsset.width`/`height`) and no catalog
       * payload carries them — threading them through would remove that settle
       * and is the honest next step, across four services and four contracts.
       *
       * ## `compact` still crops, deliberately
       *
       * The two compact slots are 80px and 128px wide. Nobody reads a title at
       * that size, so there is nothing to protect — and a natural-height image
       * there would make a fixed-size thumbnail's height vary per course and
       * pull the flex rows it sits in out of alignment. Those keep `fill` and
       * `cover` inside their own aspect box.
       */
      compact ? (
        <Image
          src={mediaUrl(coverKey)}
          alt=""
          aria-hidden="true"
          fill
          sizes={sizes ?? '128px'}
          className="course-art__thumb"
        />
      ) : (
        <Image
          src={mediaUrl(coverKey)}
          alt=""
          aria-hidden="true"
          width={1600}
          height={900}
          sizes={
            sizes ??
            '(min-width: 1280px) 560px, (min-width: 1024px) 1000px, (min-width: 768px) 50vw, 94vw'
          }
          className={`course-art__photo${className ? ` ${className}` : ''}`}
        />
      )
    );
  }

  const { hue, glyph } = subjectArt(subjectNameAr);
  const Glyph = GLYPHS[glyph];

  return (
    <span
      aria-hidden="true"
      className={`course-art${compact ? ' course-art--compact' : ''}${className ? ` ${className}` : ''}`}
      /* The one inline style in the component, and it has to be inline: the
         hue is per course and there is no class that can carry 360 values.
         Everything else about the scene lives in `globals.css`. */
      style={{ '--art-h': hue } as React.CSSProperties}
    >
      <svg
        className="course-art__shapes"
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
        focusable="false"
      >
        <defs>
          {/* Deterministic id per hue rather than per instance. Two cards in
              one subject share the pattern, which is correct — and `useId()`
              would put a fresh definition in the DOM for every card on the
              page for no visual difference. */}
          <pattern
            id={`art-dots-${hue}`}
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.5" cy="1.5" r="1.5" className="course-art__dot" />
          </pattern>
        </defs>

        <Shapes variant={artVariant(seed)} hue={hue} />
      </svg>

      <span className="course-art__mark">
        <Glyph className={compact ? 'size-4' : 'size-6'} strokeWidth={1.75} />
      </span>
      {compact ? null : <span className="course-art__subject">{subjectNameAr}</span>}
    </span>
  );
}

/**
 * The subject's glyph on its own, in a hued disc — the artwork reduced to a
 * mark for places too small to carry a scene.
 *
 * `CourseRail` shipped with a note saying that "this platform has no per-course
 * artwork and no field to hang one on, so the options were an arbitrary glyph
 * or none — and an arbitrary glyph is worse than none, because a student will
 * reasonably try to read meaning into it and there is none to read." That was
 * exactly right at the time, and it is what this fixes: the glyph is not
 * arbitrary any more. It says the SUBJECT, in the same hue the course's card
 * wears on the dashboard and in the library, so it is a mark a student can
 * actually learn.
 *
 * Solid ink rather than the gradient the scene uses. At 2rem a two-stop
 * gradient is a flat colour with extra steps, and the disc has to sit on the
 * app's own surfaces — not on artwork — so it takes the same tinted-well
 * treatment `.tile--hued` does.
 */
export function SubjectMark({
  subjectNameAr,
  className,
}: {
  subjectNameAr: string;
  className?: string;
}) {
  const { hue, glyph } = subjectArt(subjectNameAr);
  const Glyph = GLYPHS[glyph];

  return (
    <span
      aria-hidden="true"
      className={`subject-mark${className ? ` ${className}` : ''}`}
      style={{ '--art-h': hue } as React.CSSProperties}
    >
      <Glyph className="size-[55%]" strokeWidth={1.9} />
    </span>
  );
}

/**
 * The three compositions.
 *
 * Each is a large disc that anchors the frame, a ring or a rotated square for a
 * second silhouette, and a dot field cropped to part of the canvas — the same
 * three ingredients arranged differently, so the set has a family resemblance
 * rather than three unrelated styles.
 *
 * Every shape is anchored to the LEFT of the viewBox, and the glyph and subject
 * name sit at `inset-inline-start` — which under this product's RTL is the
 * RIGHT. SVG user space does not flip with `direction`, so those two are on
 * opposite sides of the frame and a disc never lands behind the label.
 */
function Shapes({ variant, hue }: { variant: 0 | 1 | 2; hue: number }) {
  const dots = `url(#art-dots-${hue})`;

  if (variant === 0) {
    return (
      <g>
        <circle cx="46" cy="150" r="86" className="course-art__wash" />
        <circle cx="72" cy="40" r="52" className="course-art__shade" />
        <circle cx="60" cy="52" r="34" className="course-art__ring" />
        <rect x="0" y="0" width="150" height="180" fill={dots} opacity="0.5" />
      </g>
    );
  }

  if (variant === 1) {
    return (
      <g>
        <circle cx="30" cy="30" r="104" className="course-art__wash" />
        <rect
          x="18"
          y="96"
          width="88"
          height="88"
          rx="22"
          className="course-art__shade"
          transform="rotate(-18 62 140)"
        />
        <circle cx="104" cy="128" r="30" className="course-art__ring" />
        <rect x="0" y="0" width="130" height="120" fill={dots} opacity="0.45" />
      </g>
    );
  }

  return (
    <g>
      <circle cx="24" cy="96" r="118" className="course-art__wash" />
      <circle cx="90" cy="150" r="46" className="course-art__shade" />
      <circle cx="88" cy="34" r="40" className="course-art__ring" />
      <circle cx="88" cy="34" r="62" className="course-art__ring" />
      <rect x="0" y="30" width="140" height="150" fill={dots} opacity="0.45" />
    </g>
  );
}
