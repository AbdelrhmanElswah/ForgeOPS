import { z } from 'zod';

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/**
 * Cursor pagination query (`?limit=20&cursor=...`).
 * Query strings are always strings, so `limit` is coerced to a number.
 */
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  cursor: z.string().min(1).optional(),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

/** Builds the response envelope for a page of `item`. `nextCursor` is null on the last page. */
export function pageOf<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
