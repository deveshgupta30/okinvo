import {
  CreateCreditNoteBodySchema,
  CreditNoteListItemSchema,
  CreditNoteSchema,
} from "@/lib/api/dto";
import { created, list } from "@/lib/api/envelope";
import { apiError } from "@/lib/api/errors";
import { draftCreditNoteFromBody, readJson, readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { CreditNoteListQuerySchema } from "@/lib/api/query";
import { isActor, requireApiActor } from "@/server/auth";
import { listCreditNotes } from "@/server/dal/credit-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/credit-notes (scope credit_notes:read). */
export const GET = withApi(async (request: Request) => {
  const actor = await requireApiActor("credit_notes:read", request.headers);
  if (!isActor(actor)) return actor;
  const q = readQuery(request, CreditNoteListQuerySchema);
  if (!q.ok) return q.response;
  const { cursor, limit, ...filters } = q.data;
  const rows = await listCreditNotes(actor, filters);
  const page = paginate(rows, { cursor, limit });
  return list(
    page.items.map((r) => CreditNoteListItemSchema.parse(r)),
    page.nextCursor,
  );
});

/** POST /api/v1/credit-notes — a draft against an issued invoice (credit_notes:create). */
export const POST = withApi(async (request: Request) => {
  const actor = await requireApiActor("credit_notes:create", request.headers);
  if (!isActor(actor)) return actor;
  const body = await readJson(request, CreateCreditNoteBodySchema);
  if (!body.ok) return body.response;
  const draft = await draftCreditNoteFromBody(actor, body.data);
  if (!draft.ok) return apiError("validation", "The body did not validate.", 400, draft.issues);
  return created(CreditNoteSchema.parse(draft.dto), `/api/v1/credit-notes/${draft.dto.id}`);
});
