import type { LessonKind } from '@ayman/contracts/content';
import { DocumentIcon, DownloadIcon, QuizIcon, VideoIcon } from './icons';

/**
 * The glyph for what a lesson IS — a video, a quiz, a reading, a download.
 *
 * One map, two consumers (the path map and the player's outline sidebar), so a
 * lesson's kind never reads as one thing on the map and another in the
 * sidebar. That divergence is easy to create and impossible to notice: the two
 * screens are never on-screen together.
 *
 * Purely decorative — every caller renders a text label beside it, so the icon
 * carries no information a screen reader would otherwise miss, and `icons.tsx`
 * already marks each SVG `aria-hidden`.
 */
const BY_KIND: Record<LessonKind, (props: { className?: string }) => React.ReactElement> = {
  video: VideoIcon,
  quiz: QuizIcon,
  attachment: DownloadIcon,
  text: DocumentIcon,
};

export function LessonKindIcon({ kind, className }: { kind: LessonKind; className?: string }) {
  const Icon = BY_KIND[kind];
  return <Icon className={className} />;
}
