/**
 * Two social marks drawn here rather than imported.
 *
 * `lucide-react` v1 removed every brand icon, and the alternative — pasting the
 * platforms' official path data — ships their trademarked artwork into our
 * bundle. These are plain geometric renditions in the same 24-grid, stroke
 * weight and `currentColor` convention as the lucide icons beside them, so the
 * footer row still reads as one set.
 *
 * The remaining channels use real lucide icons, which are close enough in
 * meaning not to need a drawing: `Music2` for TikTok, `MessageCircle` for
 * WhatsApp, `Users` for the students' group.
 */

type IconProps = { size?: number };

export function YoutubeMark({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookMark({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M15 8h-1.5A1.5 1.5 0 0 0 12 9.5V21" />
      <path d="M9.5 13h5" />
    </svg>
  );
}
