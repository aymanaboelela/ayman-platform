import Link from 'next/link';
import { copy, type PathCourse, type PathNode } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { CheckIcon, LockIcon, PlayIcon, QuizIcon } from '@/components/player/icons';

const c = copy.path;

/**
 * The vertical run of nodes for one course.
 *
 * Structure is taken from the reference the founder supplied — a column of
 * nodes, each in one of three states, with the current one calling itself out.
 * The SURFACE is this platform's: amber `--a-9` used flat, radius ≤ 8px on the
 * card, no gradients and no glow.
 *
 * `--ok` green is deliberately not used for "done". It is reserved for quiz
 * correctness, and spending a colour that carries meaning elsewhere on
 * decoration is how that meaning erodes. A cleared node is amber-filled with a
 * check; the current node is an amber ring; a locked node is muted with a lock.
 */
function nodeIcon(node: PathNode, isCurrent: boolean) {
  if (node.gate === 'cleared') return <CheckIcon className="h-5 w-5 text-[#1A1206]" />;
  if (node.gate === 'locked') return <LockIcon className="h-4 w-4 text-fg-muted" />;
  if (node.isExam) return <QuizIcon className="h-5 w-5 text-accent-text" />;
  return (
    <PlayIcon className={cn('h-4 w-4', isCurrent ? 'text-accent-text' : 'text-fg-muted')} />
  );
}

function PathNodeRow({
  node,
  courseSlug,
  isCurrent,
}: {
  node: PathNode;
  courseSlug: string;
  isCurrent: boolean;
}) {
  const locked = node.gate === 'locked';

  const marker = (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center border',
        // The exam reads as a different SHAPE, not a different colour — a
        // square node against round ones, so it is distinguishable without
        // spending another hue.
        node.isExam ? 'size-11 rounded-sm' : 'size-11 rounded-full',
        node.gate === 'cleared' && 'border-transparent bg-accent',
        node.gate === 'available' && 'border-accent bg-surface-2',
        locked && 'border-line bg-surface-2',
      )}
    >
      {nodeIcon(node, isCurrent)}
    </span>
  );

  const label = (
    <span className="min-w-0">
      <span className={cn('block truncate', locked ? 'text-fg-muted' : 'text-fg')}>
        {node.title}
      </span>
      <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
        {node.isExam ? c.exam : null}
        {node.isExam && node.gate !== 'available' ? ' · ' : null}
        {node.gate === 'cleared' ? c.done : null}
        {locked ? c.locked : null}
      </span>
    </span>
  );

  return (
    <li className="flex items-center gap-4">
      {/* The connector. A plain border on a spacer, so it needs no absolute
          positioning and cannot drift out of alignment at any font size. */}
      <span className="flex flex-col items-center self-stretch">
        {marker}
      </span>

      {locked ? (
        <span aria-disabled="true" className="min-w-0 flex-1 cursor-not-allowed">
          {label}
        </span>
      ) : (
        <Link
          href={`/courses/${courseSlug}/lessons/${node.id}`}
          className="min-w-0 flex-1 rounded-sm transition-colors duration-[160ms] ease-out hover:text-accent-text"
        >
          {label}
        </Link>
      )}

      {isCurrent ? (
        <span className="mono shrink-0 rounded-sm bg-accent px-2 py-1 text-[length:var(--fs-mono-label)] text-[#1A1206]">
          {c.startHere}
        </span>
      ) : null}
    </li>
  );
}

export function PathMap({ course }: { course: PathCourse }) {
  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[length:var(--fs-title-3)] font-medium text-fg">{course.title}</h2>
        <span className="mono tabular shrink-0 text-[length:var(--fs-mono-label)] text-fg-muted">
          {course.clearedLessons} / {course.totalLessons}
        </span>
      </header>

      {course.nodes.length === 0 ? (
        <p className="text-fg-muted">{c.nothingOpen}</p>
      ) : (
        <ol className="space-y-3">
          {course.nodes.map((node) => (
            <PathNodeRow
              key={node.id}
              node={node}
              courseSlug={course.slug}
              isCurrent={node.id === course.nextLessonId}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
