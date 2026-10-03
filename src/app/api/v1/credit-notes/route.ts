import {
  CreateCreditNoteBodySchema,
  CreditNoteListItemSchema,
  CreditNoteSchema,
} from "@/lib/api/dto";
import { created, list } from "@/lib/api/envelope";
import { apiError } from "@/lib/api/errors";
import { readJson, readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { CreditNoteListQuerySchema } from "@/lib/api/query";
import { todayIn } from "@/lib/dates";
import { CreditNoteInputSchema } from "@/lib/schemas/credit-note-input";
import { isActor, requireApiActor } from "@/server/auth";
import { createCreditNoteDraft, listCreditNotes } from "@/server/dal/credit-notes";

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
  const parsed = CreditNoteInputSchema.safeParse({
    ...body.data,
    issueDate: body.data.issueDate ?? todayIn(actor.timezone),
  });
  if (!parsed.success) {
    return apiError(
      "validation",
      "The body did not validate.",
      400,
      parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  const dto = await createCreditNoteDraft(actor, parsed.data);
  return created(CreditNoteSchema.parse(dto), `/api/v1/credit-notes/${dto.id}`);
});
