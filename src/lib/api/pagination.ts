/**
 * Cursor pagination over an ordered list (spec §7.2). The DAL lists return the whole register
 * (one business, thousands of rows at most); the API hands out pages of `limit` items and a
 * `nextCursor` that is the id of the last item sent. An unknown cursor starts from the beginning.
 */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export function clampLimit(raw: unknown): number {
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

export function paginate<T extends { id: string }>(
  items: readonly T[],
  o: { cursor?: string | null | undefined; limit?: number | undefined } = {},
): { items: T[]; nextCursor: string | null } {
  const limit = clampLimit(o.limit ?? DEFAULT_LIMIT);
  let start = 0;
  if (o.cursor) {
    const idx = items.findIndex((i) => i.id === o.cursor);
    if (idx >= 0) start = idx + 1;
  }
  const page = items.slice(start, start + limit);
  const last = page[page.length - 1];
  const more = start + limit < items.length;
  return { items: page, nextCursor: more && last ? last.id : null };
}
