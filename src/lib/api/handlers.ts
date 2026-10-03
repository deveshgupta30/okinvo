import "server-only";
import { Readable } from "node:stream";
import type { z } from "zod";
import { findDisallowed, InputCharsetError } from "@/lib/input-charset";
import { StorageNotFoundError } from "@/lib/storage";
import type { Actor } from "@/server/actor";
import type { DocumentKind } from "@/generated/prisma/client";
import { ensureDocument, getDocumentStream } from "@/server/dal/documents";
import {
  ConflictError,
  ForbiddenError,
  InvariantError,
  isDalError,
  NotFoundError,
} from "@/server/dal/errors";
import { apiError, type ApiIssue } from "./errors";
import { queryObject } from "./query";

/**
 * Shared plumbing of the /api/v1 handlers (spec §7.2): one place turns DAL errors into the error
 * envelope, reads and bounds JSON bodies, and validates query strings.
 */
export const MAX_BODY_BYTES = 1_000_000;

export function withApi<C>(
  handler: (request: Request, ctx: C) => Promise<Response>,
): (request: Request, ctx: C) => Promise<Response> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof InputCharsetError) {
    return apiError(
      "bad_charset",
      e.message,
      400,
      e.violations.map((v) => ({
        path: v.path,
        message: `disallowed character ${JSON.stringify(v.char)}`,
      })),
    );
  }
  if (e instanceof NotFoundError || e instanceof StorageNotFoundError) {
    return apiError("not_found", "Not found.", 404);
  }
  if (e instanceof ForbiddenError) return apiError("forbidden", e.message, 403);
  if (e instanceof ConflictError) return apiError("conflict", e.message, 409, issuesOf(e));
  if (e instanceof InvariantError) return apiError("invariant", e.message, 409, issuesOf(e));
  if (isDalError(e)) return apiError("bad_request", e.message, 400, issuesOf(e));
  if (e instanceof SyntaxError) return apiError("bad_request", "The body is not valid JSON.", 400);
  console.error("api/v1 unhandled", e);
  return apiError("internal", "Something went wrong.", 500);
}

function issuesOf(e: { fieldErrors?: Record<string, string[]> | undefined }): ApiIssue[] {
  return Object.entries(e.fieldErrors ?? {}).flatMap(([path, messages]) =>
    messages.map((message) => ({ path, message })),
  );
}

function zodIssues(error: z.ZodError): ApiIssue[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

/** A bounded JSON body, charset-checked, parsed with `schema`; `Response` on any failure. */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return { ok: false, response: apiError("bad_request", "The body is too large.", 413) };
  }
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return {
      ok: false,
      response: apiError("bad_request", "Send application/json.", 415),
    };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: apiError("bad_request", "The body is too large.", 413) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, response: apiError("bad_request", "The body is not valid JSON.", 400) };
  }
  const charset = findDisallowed(raw);
  if (charset.length) {
    return {
      ok: false,
      response: apiError(
        "bad_charset",
        "Only standard keyboard characters are allowed.",
        400,
        charset.map((v) => ({
          path: v.path,
          message: `disallowed character ${JSON.stringify(v.char)}`,
        })),
      ),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError("validation", "The body did not validate.", 400, zodIssues(parsed.error)),
    };
  }
  return { ok: true, data: parsed.data };
}

export function readQuery<T>(
  request: Request,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; response: Response } {
  const raw = queryObject(request);
  const charset = findDisallowed(raw);
  if (charset.length) {
    return {
      ok: false,
      response: apiError("bad_charset", "Only standard keyboard characters are allowed.", 400),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError("validation", "The query did not validate.", 400, zodIssues(parsed.error)),
    };
  }
  return { ok: true, data: parsed.data };
}

const CONTENT_TYPES = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

/** Streams the stored PDF or DOCX of an issued document (rendered on first demand). */
export async function documentResponse(
  actor: Actor,
  kind: DocumentKind,
  id: string,
  format: "PDF" | "DOCX",
): Promise<Response> {
  const doc = await ensureDocument(kind, id, { format });
  const { document, stream } = await getDocumentStream(actor, doc.id);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Length": String(document.byteSize),
      "Content-Disposition": `attachment; filename="${document.filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Document-Sha256": document.sha256,
    },
  });
}
