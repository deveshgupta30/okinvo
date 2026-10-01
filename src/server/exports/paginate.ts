import "server-only";

export const EXPORT_PAGE_SIZE = 500;

/**
 * Cursor pagination for exports (v2 §13.1): `page(cursor, take)` runs one Prisma query ordered by
 * a stable key list ending in `id`, with `cursor: { id }` + `skip: 1` when a cursor is given. Rows
 * are yielded as they arrive so a large register streams without being held in memory.
 */
export async function* paginate<T extends { id: string }>(
  page: (cursor: string | null, take: number) => Promise<T[]>,
  pageSize: number = EXPORT_PAGE_SIZE,
): AsyncGenerator<T> {
  let cursor: string | null = null;
  for (;;) {
    const rows = await page(cursor, pageSize);
    for (const row of rows) yield row;
    const last = rows.at(-1);
    if (!last || rows.length < pageSize) return;
    cursor = last.id;
  }
}
