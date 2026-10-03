import { ClientSchema } from "@/lib/api/dto";
import { list } from "@/lib/api/envelope";
import { readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { CatalogueListQuerySchema } from "@/lib/api/query";
import { isActor, requireApiActor } from "@/server/auth";
import { listClients } from "@/server/dal/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/clients (scope catalogue:read). */
export const GET = withApi(async (request: Request) => {
  const actor = await requireApiActor("catalogue:read", request.headers);
  if (!isActor(actor)) return actor;
  const q = readQuery(request, CatalogueListQuerySchema);
  if (!q.ok) return q.response;
  const rows = await listClients(actor, {
    ...(q.data.q ? { q: q.data.q } : {}),
    ...(q.data.includeArchived ? { includeArchived: true } : {}),
  });
  const page = paginate(rows, { cursor: q.data.cursor, limit: q.data.limit });
  return list(
    page.items.map((r) => ClientSchema.parse(r)),
    page.nextCursor,
  );
});
