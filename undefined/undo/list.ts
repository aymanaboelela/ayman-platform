import { z } from "zod";

export const PAGE_SIZES = [10, 20, 50, 100] as const;

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .default(20),
  q: z.string().max(120).default(""),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;

/**
 * Every list endpoint returns `{ rows, rowCount }`. `rowCount` is the TOTAL
 * matching the filter, not the page length — TanStack computes `pageCount`
 * from it and gets it wrong in every other shape.
 */
export function listResponse<T extends z.ZodTypeAny>(row: T) {
  return z.object({ rows: z.array(row), rowCount: z.number().int().min(0) });
}

export type ListResponse<T> = { rows: T[]; rowCount: number };
