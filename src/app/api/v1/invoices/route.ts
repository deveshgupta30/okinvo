import { z } from "zod";
import { InvoiceListItemSchema, InvoiceSchema } from "@/lib/api/dto";
import { created, list } from "@/lib/api/envelope";
import { apiError } from "@/lib/api/errors";
import { readJson, readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { InvoiceListQuerySchema } from "@/lib/api/query";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { isActor, requireApiActor } from "@/server/auth";
import { createDraft, listInvoices } from "@/server/dal/invoices";
import { getProfile } from "@/server/dal/profiles";

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
  const withDefaults: Record<string, unknown> = { ...body.data };
  if (withDefaults.displayConfig === undefined) {
    const profile = await getProfile(actor, body.data.issuerProfileId);
    withDefaults.displayConfig = profile.defaultDisplayConfig;
  }
  withDefaults.isReverseCharge ??= false;
  const parsed = InvoiceDraftInputSchema.safeParse(withDefaults);
  if (!parsed.success) {
    return apiError(
      "validation",
      "The body did not validate.",
      400,
      parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  const dto = await createDraft(actor, parsed.data);
  return created(InvoiceSchema.parse(dto), `/api/v1/invoices/${dto.id}`);
});
