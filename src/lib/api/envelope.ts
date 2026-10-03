/** Success envelope: `{ data }`; lists add `nextCursor` (spec §7.2). */
export function ok<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json(
    { data },
    { ...init, headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) } },
  );
}

export function created<T>(data: T, location?: string): Response {
  return ok(data, { status: 201, ...(location ? { headers: { Location: location } } : {}) });
}

export function list<T>(items: T[], nextCursor: string | null): Response {
  return Response.json({ data: items, nextCursor }, { headers: { "Cache-Control": "no-store" } });
}
