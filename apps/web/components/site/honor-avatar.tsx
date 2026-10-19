import { hashString } from '@/lib/subject-art';

/**
 * The face on لوحة الشرف for a winner with no board photo — a drawn graduate
 * on a coloured disc, instead of two initials.
 *
 * ## Why a drawing and not the initials it replaces
 *
 * «لو حد مش حاطط صورة، حط أڤاتار شكله كويس». Most winners have no photo, so
 * on a real board the monogram WAS the board: ten beige discs with two
 * letters each. A figure with a mortarboard reads as "a student who won",
 * which is the whole message of the page.
 *
 * ## Why it is the same figure for everyone
 *
 * The platform never asks boy or girl (CLAUDE.md §7), so the drawing cannot
 * either: no hair, no face — a head, shoulders and a cap. What varies is the
 * TONE, picked from the name, so ten cards are ten colours and the same
 * student keeps the same colour from one round to the next.
 *
 * ## Pure SVG, no request
 *
 * Inline, server-rendered, no image fetch: a board of ten placeholders must
 * not cost ten round trips. The gradient id is scoped by tone so two avatars
 * of the same tone on one page share a definition harmlessly.
 */
export const HONOR_AVATAR_TONES = 6;

/** The same FNV-1a the subject art keys on — stable on server and client. */
export function honorAvatarTone(name: string): number {
  return hashString(name) % HONOR_AVATAR_TONES;
}

export function HonorAvatar({ name, className }: { name: string; className?: string }) {
  const tone = honorAvatarTone(name);
  const id = `honor-avatar-${tone}`;
  return (
    <svg
      viewBox="0 0 120 120"
      className={className ? `honor-avatar ${className}` : 'honor-avatar'}
      data-tone={tone}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="honor-avatar__from" />
          <stop offset="1" className="honor-avatar__to" />
        </linearGradient>
        <clipPath id="honor-avatar-disc">
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <g clipPath="url(#honor-avatar-disc)">
        <rect width="120" height="120" fill={`url(#${id})`} />
        {/* Two soft sparkles — a prize, not a profile placeholder. */}
        <path
          className="honor-avatar__spark"
          d="M24 30l2.2 5.8L32 38l-5.8 2.2L24 46l-2.2-5.8L16 38l5.8-2.2zM95 22l1.6 4.2 4.4 1.8-4.4 1.6L95 34l-1.6-4.4-4.4-1.6 4.4-1.8z"
        />
        {/* Shoulders, then the head on them. */}
        <path className="honor-avatar__body" d="M18 122c2-24 20-38 42-38s40 14 42 38z" />
        <path className="honor-avatar__collar" d="M50 85l10 13 10-13c-3-1-6.5-1.5-10-1.5s-7 .5-10 1.5z" />
        <circle className="honor-avatar__body" cx="60" cy="58" r="19" />
        {/* The mortarboard: board, cap band, tassel. */}
        <path className="honor-avatar__cap" d="M60 24l32 12-32 12-32-12z" />
        <path className="honor-avatar__cap" d="M44 42v9c4 4 10 6 16 6s12-2 16-6v-9l-16 6z" />
        <path className="honor-avatar__tassel" d="M88 37.5v15" />
        <circle className="honor-avatar__tassel-end" cx="88" cy="54" r="3" />
      </g>
    </svg>
  );
}
