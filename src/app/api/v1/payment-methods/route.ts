import { PaymentMethodPublicSchema } from "@/lib/api/dto";
import { list } from "@/lib/api/envelope";
import { readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { CatalogueListQuerySchema } from "@/lib/api/query";
import { isActor, requireApiActor } from "@/server/auth";
import { listPaymentMethods } from "@/server/dal/payment-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/payment-methods — names and types only, never the details (catalogue:read). */
export const GET = withApi(async (request: Request) => {
  const actor = await requireApiActor("catalogue:read", request.headers);
  if (!isActor(actor)) return actor;
  const q = readQuery(request, CatalogueListQuerySchema);
  if (!q.ok) return q.response;
  const rows = await listPaymentMethods(
    actor,
    q.data.includeArchived ? { includeArchived: true } : {},
  );
  const page = paginate(rows, { cursor: q.data.cursor, limit: q.data.limit });
  return list(
    page.items.map((r) => PaymentMethodPublicSchema.parse(r)),
    page.nextCursor,
  );
});
