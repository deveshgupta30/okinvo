import { ProfilePublicSchema } from "@/lib/api/dto";
import { list } from "@/lib/api/envelope";
import { readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { CatalogueListQuerySchema } from "@/lib/api/query";
import { isActor, requireApiActor } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/profiles - issuer profiles without secrets (scope catalogue:read). */
export const GET = withApi(async (request: Request) => {
  const actor = await requireApiActor("catalogue:read", request.headers);
  if (!isActor(actor)) return actor;
  const q = readQuery(request, CatalogueListQuerySchema);
  if (!q.ok) return q.response;
  const rows = await listProfiles(actor, q.data.includeArchived ? { includeArchived: true } : {});
  const page = paginate(rows, { cursor: q.data.cursor, limit: q.data.limit });
  return list(
    page.items.map((r) => ProfilePublicSchema.parse(r)),
    page.nextCursor,
  );
});
