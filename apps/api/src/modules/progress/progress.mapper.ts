import type { CompletionSource, LessonProgressDto, LessonProgressState } from '@ayman/contracts';

/** The only columns any progress response is ever built from. */
export const PROGRESS_SELECT = {
  lessonId: true,
  state: true,
  completion: true,
  watchedSeconds: true,
  maxPositionSeconds: true,
  openCount: true,
  completedAt: true,
  completedVia: true,
} as const;

export interface ProgressRow {
  lessonId: string;
  state: string;
  completion: unknown;
  watchedSeconds: number;
  maxPositionSeconds: number;
  openCount: number;
  completedAt: Date | null;
  completedVia: string | null;
}

/** Prisma `Decimal` → number, `Date` → ISO string. Nothing else crosses. */
export function toProgressDto(row: ProgressRow): LessonProgressDto {
  return {
    lessonId: row.lessonId,
    state: row.state as LessonProgressState,
    completion: Number(row.completion),
    watchedSeconds: row.watchedSeconds,
    maxPositionSeconds: row.maxPositionSeconds,
    openCount: row.openCount,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedVia: (row.completedVia as CompletionSource | null) ?? null,
  };
}
