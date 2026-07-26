export interface ScoreBucket {
  bucket: number;
  n: number;
}

/** Ten bars, one amber fill, a hairline axis. No chart library — ten bars
 *  do not justify a dependency. No gradient, no green/red — this is a
 *  distribution, not a correctness verdict. */
export function ScoreHistogram({ distribution }: { distribution: ScoreBucket[] }) {
  const byBucket = new Map(distribution.map((row) => [row.bucket, row.n]));
  const bars = Array.from({ length: 10 }, (_, index) => byBucket.get(index + 1) ?? 0);
  const max = Math.max(1, ...bars);

  return (
    <div className="flex h-40 items-end gap-2 border-b border-line-subtle pb-2">
      {bars.map((n, index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-1">
          <span className="mono text-[length:var(--fs-mono-label)] tabular-nums text-fg-muted">{n}</span>
          <div
            className="w-full rounded-t-xs bg-accent"
            style={{ height: `${Math.max(2, (n / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
