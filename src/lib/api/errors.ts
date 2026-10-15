/**
 * Error envelope of the versioned API (spec §7.2): `{ error: { code, message, issues? } }` with a
 * stable machine-readable `code`. Never leaks stack traces or internal identifiers.
 */
export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "insufficient_scope"
  | "not_found"
  | "validation"
  | "bad_charset"
  | "bad_request"
  | "conflict"
  | "invariant"
  | "rate_limited"
  | "method_not_allowed"
  | "internal";

export interface ApiIssue {
  path: string;
  message: string;
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  issues?: ApiIssue[],
  headers?: HeadersInit,
): Response {
  return Response.json(
    { error: { code, message, ...(issues && issues.length ? { issues } : {}) } },
    { status, headers: { "Cache-Control": "no-store", ...(headers ?? {}) } },
  );
}
