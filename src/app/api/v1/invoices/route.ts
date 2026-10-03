import { z } from "zod";
import { InvoiceListItemSchema, InvoiceSchema } from "@/lib/api/dto";
import { created, list } from "@/lib/api/envelope";
import { apiError } from "@/lib/api/errors";
import { draftInvoiceFromBody, readJson, readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { InvoiceListQuerySchema } from "@/lib/api/query";
import { isActor, requireApiActor } from "@/server/auth";
import { listInvoices } from "@/server/dal/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/invoices — the register, newest first, cursor-paginated (scope invoices:read). */
export const GET = withApi(async (request: Request) => {
  const actor = await requireApiActor("invoices:read", request.headers);
  if (!isActor(actor)) return actor;
  const q = readQuery(request, InvoiceListQuerySchema);
  if (!q.ok) return q.response;
  const { cursor, limit, ...filters } = q.data;
  const rows = await listInvoices(actor, filters);
  const page = paginate(rows, { cursor, limit });
  return list(
    page.items.map((r) => InvoiceListItemSchema.parse(r)),
    page.nextCursor,
  );
});

/** Loose body: the draft input without the display config, which defaults from the profile. */
const BodySchema = z.looseObject({ issuerProfileId: z.string().min(1) });

/** POST /api/v1/invoices — a draft (scope invoices:create); issue it with /issue. */
export const POST = withApi(async (request: Request) => {
  const actor = await requireApiActor("invoices:create", request.headers);
  if (!isActor(actor)) return actor;
  const body = await readJson(request, BodySchema);
  if (!body.ok) return body.response;
  const draft = await draftInvoiceFromBody(actor, body.data);
  if (!draft.ok) return apiError("validation", "The body did not validate.", 400, draft.issues);
  return created(InvoiceSchema.parse(draft.dto), `/api/v1/invoices/${draft.dto.id}`);
});
