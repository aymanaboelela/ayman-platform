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
  className?: string;
}) {
  if (coverKey) {
    return (
      /*
       * A raw <img>, not next/image, and all four previous call sites gave the
       * same reason: covers are arbitrary admin uploads served from the MEDIA
       * origin, which is deliberately not the app origin and therefore not in
       * `next.config`'s `remotePatterns` — the optimizer refuses them at
       * request time. The caller's fixed aspect box is what makes that safe:
       * the space is reserved before the bytes arrive, so there is no CLS.
       */
      <img
        src={mediaUrl(coverKey)}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className={`course-art__photo${className ? ` ${className}` : ''}`}
      />
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
