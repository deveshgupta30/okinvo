import { ServiceSchema } from "@/lib/api/dto";
import { list } from "@/lib/api/envelope";
import { readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { CatalogueListQuerySchema } from "@/lib/api/query";
import { isActor, requireApiActor } from "@/server/auth";
import { listServices } from "@/server/dal/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/services (scope catalogue:read). */
export const GET = withApi(async (request: Request) => {
  const actor = await requireApiActor("catalogue:read", request.headers);
  if (!isActor(actor)) return actor;
  const q = readQuery(request, CatalogueListQuerySchema);
  if (!q.ok) return q.response;
  const rows = await listServices(actor, {
    ...(q.data.includeArchived ? { includeArchived: true } : {}),
    ...(q.data.issuerProfileId ? { forIssuerProfileId: q.data.issuerProfileId } : {}),
  });
  const filtered = q.data.q
    ? rows.filter((r) => r.name.toLowerCase().includes(q.data.q!.toLowerCase()))
    : rows;
  const page = paginate(filtered, { cursor: q.data.cursor, limit: q.data.limit });
  return list(
    page.items.map((r) => ServiceSchema.parse(r)),
    page.nextCursor,
  );
});
