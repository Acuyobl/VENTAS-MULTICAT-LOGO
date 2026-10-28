import { z } from 'zod';

export const cursorPageSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CursorPageQuery = z.infer<typeof cursorPageSchema>;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
